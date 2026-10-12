"use client";

import { useEffect, useRef, useState } from "react";
import { assignWorkflowItem, commentWorkflowItem, fetchRegisteredUsers, fetchTestCases, fetchTestPlans, fetchWorkflowItem, fixWorkflowItem, testWorkflowItem, transitionWorkflowItem } from "@/lib/api";
import type { UserRecord } from "@/lib/api";
import type { TestCase, WorkflowItem, WorkflowStatus } from "@/lib/types";
import CodeHighlighter from "./CodeHighlighter";

const roleActions: Record<string, WorkflowStatus[]> = {
  developer: ["IN_PROGRESS", "QA_REVIEW"],
  qa: ["REOPENED"],
  tester: ["CLOSED", "REOPENED"],
  admin: ["ASSIGNED", "IN_PROGRESS", "QA_REVIEW", "CLOSED", "REOPENED"],
};
const controlStyle = { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.15)", fontSize: "13px", fontFamily: "inherit" };

export default function WorkflowDetails({ id, role, styles, onChanged, showFixEditor = true }: {
  id: string;
  role: string;
  styles: Record<string, string>;
  onChanged: () => void;
  showFixEditor?: boolean;
}) {
  const [item, setItem] = useState<WorkflowItem | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [assignees, setAssignees] = useState({ developer: "", qa: "", tester: "" });
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  const [code, setCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [caseId, setCaseId] = useState("");
  const [verdict, setVerdict] = useState<"PASS" | "FAIL" | "BLOCKED">("PASS");
  const [logs, setLogs] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let live = true;
    async function load(initial = false) {
      if (busyRef.current) return;
      try {
        const { item: current } = await fetchWorkflowItem(id);
        if (!live || busyRef.current) return;
        setItem(current);
        if (initial) {
          setAssignees({ developer: current.assigned_developer || "", qa: current.assigned_qa || "", tester: current.assigned_tester || "" });
          setCode(current.fixed_code || "");
          setExplanation(current.fix_explanation || current.fix_summary || "");
          const directory = await fetchRegisteredUsers();
          if (live) setUsers(directory.users);
          if (role !== "developer") {
            const plans = await fetchTestPlans(current.project_id);
            const groups = await Promise.all(plans.plans.map(p => fetchTestCases({ plan_id: p.id })));
            if (live) setCases(groups.flatMap(g => g.cases));
          }
        }
      } catch (err) { if (live) setError(err instanceof Error ? err.message : "Unable to load workflow details"); }
    }
    void load(true);
    const poll = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(poll, 15000);
    window.addEventListener("focus", poll);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener("focus", poll); };
  }, [id, role]);

  async function mutate(action: () => Promise<WorkflowItem>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setFeedback("");
    try {
      setItem(await action());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow action failed");
      // A fix may have succeeded before its handoff failed, or another user changed the version.
      try { setItem((await fetchWorkflowItem(id)).item); } catch { /* Keep the original action error. */ }
      onChanged();
    } finally { busyRef.current = false; setBusy(false); }
  }

  const buttonClass = styles.actionBtnSecondary || styles.actionBtn || styles.btnSecondary;
  if (!item) return <div>{error ? <p role="alert">{error}</p> : <p>Loading workflow...</p>}</div>;
  const canFix = (role === "developer" || role === "admin") && item.allowed_actions.includes("FIXED");
  const canTest = ((role === "qa" || role === "admin") && item.workflow_status === "QA_REVIEW") || ((role === "tester" || role === "admin") && item.workflow_status === "TESTING");
  const selectedCase = cases.find(c => c.id === caseId);

  return <div>
    <h3>{item.id}: {item.title}</h3>
    <p><strong>{item.workflow_status}</strong> | Version {item.version} | {item.severity} / {item.priority}</p>
    <p>{item.description || item.summary}</p>
    <p>File: <code>{item.target_file || "Not specified"}</code></p>
    <p>Developer: {item.assigned_developer || "Unassigned"} | QA: {item.assigned_qa || "Unassigned"} | Tester: {item.assigned_tester || "Unassigned"}</p>
    {error && <p role="alert">{error}</p>}
    {feedback && <pre role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{feedback}</pre>}
    <fieldset disabled={busy} style={{ border: "none", padding: 0 }}>
      {(role === "admin" || role === "qa" || role === "developer") && <details>
        <summary>Assign registered users</summary>
        <form onSubmit={e => { e.preventDefault(); void mutate(async () => (await assignWorkflowItem(id, assignees)).item); }}>
          {(["developer", "qa", "tester"] as const).map(r => <label key={r}>{r}
            <select className={styles.formSelect} style={controlStyle} value={assignees[r]} onChange={e => setAssignees(a => ({ ...a, [r]: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.filter(u => u.role === r).map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
            </select>
          </label>)}
          <button className={buttonClass}>Save assignment</button>
        </form>
      </details>}
      {canFix && showFixEditor && <details open>
        <summary>Developer fix</summary>
        <form onSubmit={e => { e.preventDefault(); void mutate(async () => {
          const fixed = await fixWorkflowItem(id, code, explanation.trim(), item.version);
          setItem(fixed.item);
          const submitted = await transitionWorkflowItem(id, "QA_REVIEW", explanation.trim(), fixed.item.version);
          setFeedback("Fix validated and applied. Submitted to QA review.");
          return submitted.item;
        }); }}>
          <label>Fix explanation<textarea className={styles.formTextarea} style={controlStyle} value={explanation} onChange={e => setExplanation(e.target.value)} required rows={3} /></label>
          <label>Complete replacement file (not a snippet)<textarea className={styles.formTextarea} style={{ ...controlStyle, fontFamily: "monospace" }} value={code} onChange={e => setCode(e.target.value)} required rows={12} spellCheck={false} /></label>
          <button className={buttonClass} disabled={!code.trim() || !explanation.trim()}>Validate, apply & submit to QA</button>
        </form>
      </details>}
      {(item.fixed_code || item.fix_summary || item.fix_explanation) && <details>
        <summary>Submitted fix</summary>
        <p>{item.fix_explanation || item.fix_summary}</p>
        {item.fixed_code && <CodeHighlighter code={item.fixed_code} />}
      </details>}
      <label>Review / transition notes<textarea className={styles.formTextarea} style={controlStyle} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {canTest && <form onSubmit={e => { e.preventDefault(); void mutate(async () => {
        const response = await testWorkflowItem(id, { test_case_id: caseId || undefined, result: selectedCase?.target_file ? undefined : verdict, notes: notes.trim(), evidence: { logs, screenshot_url: screenshot } });
        setFeedback(JSON.stringify(response.result, null, 2));
        return response.item;
      }); }}>
        <label>Test case<select className={styles.formSelect} style={controlStyle} value={caseId} onChange={e => setCaseId(e.target.value)}>
          <option value="">Manual evidence</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.title}{c.target_file ? ` (${c.target_file})` : " (manual)"}</option>)}
        </select></label>
        {!selectedCase?.target_file && <label>Result<select className={styles.formSelect} style={controlStyle} value={verdict} onChange={e => setVerdict(e.target.value as typeof verdict)}>
          <option>PASS</option><option>FAIL</option><option>BLOCKED</option>
        </select></label>}
        <label>Evidence logs<textarea className={styles.formTextarea} style={controlStyle} rows={3} value={logs} onChange={e => setLogs(e.target.value)} /></label>
        <label>Screenshot URL<input type="url" className={styles.formInput} style={controlStyle} value={screenshot} onChange={e => setScreenshot(e.target.value)} /></label>
        <p>PASS hands QA review to Testing, or Testing to Verified. FAIL reopens the item; BLOCKED retains the review stage.</p>
        <button className={buttonClass} disabled={!selectedCase?.target_file && !notes.trim()}>{selectedCase?.target_file ? "Execute server test & record actual result" : "Record evidence & result"}</button>
      </form>}
      {item.allowed_actions.filter(a => roleActions[role]?.includes(a as WorkflowStatus)).map(next => <button key={next} type="button" className={buttonClass} disabled={next === "REOPENED" && !notes.trim()} onClick={() => void mutate(async () => (await transitionWorkflowItem(id, next as WorkflowStatus, notes.trim(), item.version)).item)}>
        {next === "QA_REVIEW" ? "Submit to QA review" : next === "CLOSED" ? "Close verified item" : next.replaceAll("_", " ")}
      </button>)}
      <form onSubmit={e => { e.preventDefault(); void mutate(async () => { const response = await commentWorkflowItem(id, comment.trim()); setComment(""); return response.item; }); }}>
        <label>Comment<textarea className={styles.formTextarea} style={controlStyle} rows={2} value={comment} onChange={e => setComment(e.target.value)} required /></label>
        <button className={buttonClass} disabled={!comment.trim()}>Add comment</button>
      </form>
    </fieldset>
    {busy && <p role="status">Saving / executing...</p>}
    <details open><summary>Comments ({item.comments.length})</summary>
      {item.comments.map(c => <p key={c.id}><strong>{c.actor} ({c.role})</strong> <time>{c.timestamp}</time><br />{c.text}</p>)}
    </details>
    <details><summary>Lifecycle history</summary>
      {item.history.map((h, i) => <p key={i}><time>{h.timestamp}</time> {h.actor} {h.role} {h.action} {h.status}<br />{h.notes}</p>)}
    </details>
    <details><summary>Fix history ({item.fix_history.length})</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(item.fix_history, null, 2)}</pre></details>
    <details><summary>Test results ({item.test_results.length})</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(item.test_results, null, 2)}</pre></details>
  </div>;
}
