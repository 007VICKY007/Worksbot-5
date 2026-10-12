"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNotifications, fetchWorkflowItems, fetchWorkflowSummary, readNotification } from "./api";
import type { WorkflowItem, WorkflowNotification, WorkflowSummary } from "./types";

export function useWorkflow(enabled: boolean, projectId?: string) {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const generation = ++request.current;
    try {
      const [queue, metrics, inbox] = await Promise.all([
        fetchWorkflowItems(projectId), fetchWorkflowSummary(projectId), fetchNotifications(),
      ]);
      if (request.current !== generation) return;
      setItems(queue.items);
      setSummary(metrics);
      setNotifications(inbox.items);
      setUnread(inbox.unread);
      setError("");
    } catch (err) {
      if (request.current === generation) setError(err instanceof Error ? err.message : "Workflow refresh failed");
    }
  }, [enabled, projectId]);

  useEffect(() => {
    setItems([]);
    setSummary(null);
    if (!enabled) return;
    void refresh();
    const poll = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(poll, 15000);
    window.addEventListener("focus", poll);
    return () => {
      ++request.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [enabled, refresh]);

  async function markRead(id: string) {
    try {
      await readNotification(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark notification read");
    }
  }

  return { items, summary, notifications, unread, error, refresh, markRead };
}
