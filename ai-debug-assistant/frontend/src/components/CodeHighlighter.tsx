"use client";
import { useMemo } from "react";
import styles from "./CodeHighlighter.module.css";

// ── Token types ───────────────────────────────────────────────────────────────
type TT =
  | "keyword" | "string" | "comment" | "number"
  | "builtin" | "decorator" | "funcname" | "classname"
  | "operator" | "plain";

interface Token { type: TT; text: string }

// ── Universal Multi-Language vocabulary ───────────────────────────────────────
const KEYWORDS = new Set([
  // Python
  "def","class","import","from","return","if","else","elif","for",
  "while","try","except","finally","with","as","pass","break",
  "continue","None","True","False","and","or","not","in","is",
  "lambda","yield","raise","del","global","nonlocal","assert",
  "async","await","self","cls",
  // JS/TS
  "function","const","let","var","export","default","new","this","typeof",
  "instanceof","catch","switch","case","interface","type","implements",
  "extends","super","constructor","static","readonly","any","unknown",
  "never","null","undefined","true","false",
  // Java / C# / C / C++
  "public","private","protected","void","int","float","double","boolean",
  "char","byte","short","long","final","abstract","volatile","synchronized",
  "throw","throws","package","namespace","using","include","struct","typedef",
  // Go & Rust
  "func","package","defer","go","chan","select","fallthrough","range",
  "fn","mut","let","pub","use","mod","match","trait","impl","enum","unsafe",
  // SQL & Shell
  "SELECT","FROM","WHERE","INSERT","INTO","UPDATE","DELETE","JOIN","INNER",
  "LEFT","RIGHT","GROUP","BY","ORDER","LIMIT","DROP","TABLE","echo","fi","done",
]);

const BUILTINS = new Set([
  "print","len","range","enumerate","zip","map","filter","list",
  "dict","set","tuple","str","int","float","bool","type","isinstance",
  "hasattr","getattr","setattr","super","property","console","log",
  "error","warn","System","out","println","printf","malloc","free",
  "make","new","len","cap","append","println!","format!","panic!",
  "String","Number","Boolean","Array","Object","Promise","Math",
  "Exception","Error","RuntimeException","NullPointerException",
]);

// ── Multi-Language Tokenizer ──────────────────────────────────────────────────
const TOKEN_RE =
  /(@\w+|\/\/.*|\/\*[\s\S]*?\*\/|#.*|"""[\s\S]*?"""|'''[\s\S]*?'''|`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*(?:[eE][+-]?\d+)?\b|\b[a-zA-Z_]\w*\b|[+\-*/%=<>!&|^~:.,()\[\]{}])/g;

function tokenize(code: string): Token[] {
  const toks: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) toks.push({ type: "plain", text: code.slice(last, m.index) });
    const t = m[0];
    let type: TT = "plain";

    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("#")) type = "comment";
    else if (t.startsWith("@"))                  type = "decorator";
    else if (t[0] === '"' || t[0] === "'" || t[0] === "`") type = "string";
    else if (/^\d/.test(t))                      type = "number";
    else if (/^[+\-*/%=<>!&|^~]/.test(t))       type = "operator";
    else if (KEYWORDS.has(t) || KEYWORDS.has(t.toUpperCase())) type = "keyword";
    else if (BUILTINS.has(t))                    type = "builtin";

    toks.push({ type, text: t });
    last = m.index + t.length;
  }
  if (last < code.length) toks.push({ type: "plain", text: code.slice(last) });

  // Second pass — mark function / class names
  for (let i = 0; i < toks.length; i++) {
    const txt = toks[i].text;
    if (toks[i].type === "keyword" &&
        (txt === "def" || txt === "function" || txt === "fn" || txt === "func" || txt === "class" || txt === "struct")) {
      const isFunc = txt !== "class" && txt !== "struct";
      for (let j = i + 1; j < toks.length; j++) {
        if (/^\s+$/.test(toks[j].text)) continue;
        if (/^[a-zA-Z_]\w*$/.test(toks[j].text)) {
          toks[j].type = isFunc ? "funcname" : "classname";
        }
        break;
      }
    }
  }
  return toks;
}

// ── Colour map (material-ocean palette) ──────────────────────────────────────
const COLOR: Record<TT, string> = {
  keyword:   "#c792ea",
  string:    "#c3e88d",
  comment:   "#546e7a",
  number:    "#f78c6c",
  builtin:   "#82aaff",
  decorator: "#ffcb6b",
  funcname:  "#82aaff",
  classname: "#ffcb6b",
  operator:  "#89ddff",
  plain:     "#cdd3de",
};

// ── Split tokens into per-line arrays ─────────────────────────────────────────
function toLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [];
  let cur: Token[] = [];

  for (const tok of tokens) {
    const parts = tok.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) cur.push({ type: tok.type, text: parts[i] });
      if (i < parts.length - 1) { lines.push(cur); cur = []; }
    }
  }
  lines.push(cur);
  return lines;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  code:      string;
  language?: string;   // reserved — currently always Python highlight
}

export default function CodeHighlighter({ code }: Props) {
  const lines = useMemo(() => toLines(tokenize(code)), [code]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.inner}>

        {/* Line numbers */}
        <div className={styles.gutterCol} aria-hidden>
          {lines.map((_, i) => (
            <div key={i} className={styles.gutterNum}>{i + 1}</div>
          ))}
        </div>

        {/* Highlighted code */}
        <pre className={styles.pre}>
          {lines.map((line, i) => (
            <div key={i} className={styles.line}>
              {line.length === 0
                ? "\u00a0"   /* keep empty lines visible */
                : line.map((tok, j) => (
                    <span key={j} style={{ color: COLOR[tok.type] }}>
                      {tok.text}
                    </span>
                  ))
              }
            </div>
          ))}
        </pre>

      </div>
    </div>
  );
}
