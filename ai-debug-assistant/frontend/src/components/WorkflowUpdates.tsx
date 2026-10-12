"use client";

import type { useWorkflow } from "@/lib/useWorkflow";

export default function WorkflowUpdates({ workflow, onSelect, buttonClass }: {
  workflow: ReturnType<typeof useWorkflow>;
  onSelect: (id: string) => void;
  buttonClass?: string;
}) {
  const s = workflow.summary;
  return <div>
    {workflow.error && <p role="alert">{workflow.error}</p>}
    {s && <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
      Bugs: {s.total_bugs} | Open: {s.open_bugs} | Critical: {s.critical_bugs} | Fixed: {s.fixed_bugs} | QA: {s.waiting_for_qa} | Testing: {s.waiting_for_testing}<br />
      Tests: {s.passed_tests} passed / {s.failed_tests} failed | Code quality: {s.code_quality_score ?? "Unknown"} | Security: {s.security_score ?? "Unknown"} | Coverage: {s.coverage == null ? "Unknown" : `${s.coverage}%`}
    </p>}
    <details>
      <summary>Notifications ({workflow.unread} unread)</summary>
      {workflow.notifications.length === 0 && <p>No notifications.</p>}
      {workflow.notifications.map(n => <div key={n.id}>
        <button type="button" className={buttonClass} onClick={() => { onSelect(n.item_id); void workflow.markRead(n.id); }}>
          {n.read ? "Read" : "Unread"}: {n.message}
        </button>{" "}<time>{n.created_at}</time>
        {!n.read && <button type="button" className={buttonClass} onClick={() => void workflow.markRead(n.id)}>Mark read</button>}
      </div>)}
    </details>
    <button type="button" className={buttonClass} onClick={() => void workflow.refresh()}>Refresh workflow</button>
  </div>;
}
