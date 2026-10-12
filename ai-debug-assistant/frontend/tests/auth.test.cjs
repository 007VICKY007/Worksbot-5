const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the shared browser helpers without adding a frontend test framework.
function setup(pathname = "/", status = 200) {
  const storage = new Map();
  const redirects = [];
  const requests = [];
  const context = vm.createContext({
    atob, Date, Error, process, URLSearchParams,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    window: { location: { pathname, replace: url => redirects.push(url) } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(status === 200 ? { total_vectors: 3 } : { detail: "Request rejected" }), { status });
    },
  });
  function load(name) {
    const source = readFileSync(path.join(__dirname, `../src/lib/${name}.ts`), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    context.exports = {};
    vm.runInContext(outputText, context, { filename: `${name}.ts` });
    return context.exports;
  }
  const auth = load("auth");
  context.require = name => {
    assert.equal(name, "./auth");
    return auth;
  };
  const api = load("api");
  return { auth, api, storage, redirects, requests, context };
}

function token(exp = Math.floor(Date.now() / 1000) + 3600) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "user", exp })).toString("base64url")}.signature`;
}

test("valid sessions retain their token and send authenticated RAG requests", async () => {
  const { auth, api, redirects, requests } = setup();
  const jwt = token();
  auth.saveSession(jwt, "user", "developer");
  assert.equal(auth.isLoggedIn(), true);
  assert.equal(auth.getToken(), jwt);
  assert.equal((await api.fetchRAGStats()).total_vectors, 3);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${jwt}`);
  assert.deepEqual(redirects, []);
});

test("expired, malformed, and missing tokens clear all session metadata", () => {
  const { auth, storage } = setup();
  for (const jwt of [token(0), token(Math.floor(Date.now() / 1000)), token("9999999999"), "a.e30.c", "a.bnVsbA.c", "broken", "a.@@@.c", "undefined", "null", ""]) {
    auth.saveSession(jwt, "user", "admin");
    assert.equal(auth.isLoggedIn(), false, jwt);
    assert.equal(storage.size, 0, jwt);
  }
});

test("an expired session redirects before sending protected requests", async () => {
  const { auth, api, redirects, requests } = setup();
  auth.saveSession(token(0), "user");
  await assert.rejects(api.fetchRAGStats(), api.SessionExpiredError);
  assert.deepEqual(redirects, ["/login"]);
  assert.equal(requests.length, 0);
});

test("concurrent protected 401 responses clear the session and redirect once", async () => {
  const { auth, api, storage, redirects } = setup("/", 401);
  auth.saveSession(token(), "user");
  const results = await Promise.allSettled([api.fetchRAGStats(), api.fetchRAGMemories()]);
  for (const result of results) {
    assert.equal(result.status, "rejected");
    assert.ok(result.reason instanceof api.SessionExpiredError);
  }
  assert.equal(storage.size, 0);
  assert.deepEqual(redirects, ["/login"]);
});

test("admin session rejection returns to the inline admin sign-in", async () => {
  const { auth, api, redirects } = setup("/admin", 401);
  auth.saveSession(token(), "admin", "admin");
  await assert.rejects(api.fetchRAGStats(), api.SessionExpiredError);
  assert.deepEqual(redirects, ["/admin"]);
});

test("login and registration 401 responses stay inline and preserve any existing session", async () => {
  const { auth, api, redirects } = setup("/login", 401);
  auth.saveSession(token(), "user");
  await assert.rejects(api.login("user", "wrong"), /Request rejected/);
  await assert.rejects(api.registerUser("user", "wrong"), /Request rejected/);
  assert.equal(auth.isLoggedIn(), true);
  assert.deepEqual(redirects, []);
});

test("permission and server errors do not clear valid sessions", async () => {
  for (const status of [403, 500]) {
    const { auth, api, redirects } = setup("/", status);
    auth.saveSession(token(), "user");
    await assert.rejects(api.fetchRAGStats(), /Request rejected/);
    assert.equal(auth.isLoggedIn(), true);
    assert.deepEqual(redirects, []);
  }
});

test("session checks are safe during server rendering", () => {
  const { auth, context } = setup();
  delete context.window;
  assert.equal(auth.getToken(), null);
  assert.equal(auth.isLoggedIn(), false);
});
