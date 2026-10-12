"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { clearSession, getUserRole, getUsername } from "@/lib/auth";

interface RoleAbilitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole?: string;
}

export default function RoleAbilitiesModal({ isOpen, onClose, currentRole }: RoleAbilitiesModalProps) {
  const router = useRouter();
  const activeRole = currentRole || getUserRole();
  const activeUser = getUsername() || "user";

  if (!isOpen) return null;

  function handleSwitch() {
    clearSession();
    onClose();
    router.push("/login");
  }

  const roleDefinitions = [
    {
      key: "developer" as const,
      title: "Developer",
      workspace: "Developer Workspace (/)",
      route: "/",
      badge: "Implementation & Fixes",
      summary: "Responsible for local codebase development, deterministic AST analysis, AI-assisted bug diagnosis, sandboxed patch application, and local unit test verification.",
      abilities: [
        "Multi-Language AST Analysis: Syntax, lint, security & code smells across 10+ languages (Python, JS, TS, Java, C/C++, Go, Rust, SQL, Bash)",
        "AI Root Cause Reasoning: Contextual diagnostics with code retrieval and highlighted diff suggestions",
        "Safe Sandboxed Patch Application: Automated .bak backup creation with 1-click restore/rollback",
        "Local Unit Execution Console: Verify individual fixed files immediately via isolated subprocess runner",
        "Developer Ticket Lifecycle: Advance assigned tickets from open → in_progress → in_testing",
      ],
      restrictions: [
        "Cannot approve or override the Authoritative Quality Gate (Restricted to QA)",
        "Cannot push production releases or trigger production deployments (Restricted to QA/Admin)",
        "Cannot author formal QA test plans or triage system-wide bug categories",
      ],
    },
    {
      key: "tester" as const,
      title: "Software Tester",
      workspace: "Software Tester Workspace (/testing)",
      route: "/testing",
      badge: "Test Execution & Bugs",
      summary: "Responsible for test run execution, live subprocess runner verification, test verdict recording, bug ticket filing, and developer fix verification.",
      abilities: [
        "Test Run Orchestration: Create & manage test runs for Development and Staging environments",
        "Live Subprocess Runner: Execute test files & cases in real-time with exit codes, ms timing, and stdout/stderr capture",
        "Verification Queue & Evidence: Record PASS / FAIL / BLOCKED / SKIPPED with observation notes",
        "One-Click Bug Reporting: Instantly file official MND bug tickets directly from test failures with pre-filled logs",
        "Ticket Verification: Advance verified fixes (in_testing → qa_verification) or reject back to in_progress",
      ],
      restrictions: [
        "Cannot modify or patch source code files directly (Developer domain)",
        "Cannot approve production Quality Gate or trigger deployment (QA domain)",
        "Cannot author formal test plans or strategies",
      ],
    },
    {
      key: "qa" as const,
      title: "QA Engineer",
      workspace: "QA Strategy & Quality Gate Workspace (/qa)",
      route: "/qa",
      badge: "Quality Gate & Release",
      summary: "Responsible for holistic quality strategy, AI test synthesis, multi-environment validation, bug triage, authoritative quality gatekeeping, and release signing.",
      abilities: [
        "Formal Test Plan Strategy: Author test plans, define milestones, specify scopes, and track targets",
        "AI Test Case Synthesis via GPT-4o: Automatically generate boundary, edge-case, and functional regression test suites",
        "Multi-Environment Matrix: Concurrently execute test suites across 4 environments (Dev, Staging, QA Sandbox, Prod-Sim)",
        "Authoritative Quality Gate: Evaluate pass rates (≥85%), blocker counts (=0), and issue official APPROVED / BLOCKED verdicts",
        "Production Release Gatekeeper: Trigger verified GitHub releases, commit tags, and deployment pipelines",
        "Bug Triage & Assignment: Assign bugs to developers, update priorities, close verified bugs, or reopen failing issues",
      ],
      restrictions: [
        "Does not write daily feature implementation code (focuses on validation, quality gates, and release safety)",
      ],
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 249, 0.94) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: "20px",
          border: "1.5px solid rgba(22, 122, 91, 0.25)",
          boxShadow: "0 25px 60px rgba(15, 23, 42, 0.25), 0 0 40px rgba(22, 122, 91, 0.12)",
          maxWidth: "1140px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "linear-gradient(135deg, rgba(22, 122, 91, 0.06) 0%, rgba(255, 255, 255, 0.8) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #167a5b 0%, #10b981 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(22, 122, 91, 0.3)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 style={{ fontSize: "19px", fontWeight: 800, color: "var(--text-primary, #0f172a)", margin: 0 }}>
                  Engineering Roles &amp; Ability Separation
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: "9999px",
                    background: "rgba(22, 122, 91, 0.15)",
                    color: "var(--sage-primary, #167a5b)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Active: {activeRole.toUpperCase()} ({activeUser})
                </span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary, #64748b)", margin: "4px 0 0" }}>
                Mindora clearly delineates abilities between Developers, Software Testers, and QA Engineers for enterprise accountability.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(0, 0, 0, 0.05)",
              border: "none",
              borderRadius: "8px",
              width: "32px",
              height: "32px",
              fontSize: "16px",
              cursor: "pointer",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Grid */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          {roleDefinitions.map((roleDef) => {
            const isCurrent = activeRole.toLowerCase() === roleDef.key;
            return (
              <div
                key={roleDef.key}
                style={{
                  background: isCurrent ? "rgba(22, 122, 91, 0.04)" : "rgba(255, 255, 255, 0.7)",
                  border: isCurrent ? "2px solid #167a5b" : "1.5px solid rgba(0, 0, 0, 0.08)",
                  borderRadius: "16px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isCurrent ? "0 8px 24px rgba(22, 122, 91, 0.15)" : "none",
                }}
              >
                {isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-10px",
                      right: "18px",
                      background: "#167a5b",
                      color: "#fff",
                      fontSize: "10.5px",
                      fontWeight: 800,
                      padding: "2px 10px",
                      borderRadius: "9999px",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      boxShadow: "0 2px 6px rgba(22, 122, 91, 0.4)",
                    }}
                  >
                    Your Active Role
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--text-primary, #0f172a)" }}>
                      {roleDef.title}
                    </h3>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#167a5b", marginTop: "2px" }}>
                      {roleDef.workspace}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: "rgba(0, 0, 0, 0.05)",
                      color: "var(--text-secondary, #475569)",
                    }}
                  >
                    {roleDef.badge}
                  </span>
                </div>

                <p style={{ fontSize: "12.5px", color: "var(--text-secondary, #475569)", lineHeight: 1.5, marginBottom: "14px", minHeight: "48px" }}>
                  {roleDef.summary}
                </p>

                {/* Abilities List */}
                <div style={{ marginBottom: "14px", flex: 1 }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "#167a5b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span>✓</span> Allowed Capabilities
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "#334155", lineHeight: 1.55 }}>
                    {roleDef.abilities.map((ab, idx) => (
                      <li key={idx} style={{ marginBottom: "5px" }}>{ab}</li>
                    ))}
                  </ul>
                </div>

                {/* Restrictions List */}
                <div style={{ marginBottom: "16px", background: "rgba(0, 0, 0, 0.03)", padding: "10px 12px", borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "#94a3b8", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span>🔒</span> Role Boundaries &amp; Restrictions
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11.5px", color: "#64748b", lineHeight: 1.5 }}>
                    {roleDef.restrictions.map((res, idx) => (
                      <li key={idx} style={{ marginBottom: "3px" }}>{res}</li>
                    ))}
                  </ul>
                </div>

                {/* Action button */}
                <div style={{ display: "flex", gap: "8px" }}>
                  {isCurrent ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        router.push(roleDef.route);
                      }}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: "10px",
                        background: "#167a5b",
                        color: "#fff",
                        border: "none",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <span>➔</span> Enter {roleDef.title} Workspace
                    </button>
                  ) : (
                    <button
                      type="button"
                       onClick={handleSwitch}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: "10px",
                        background: "rgba(22, 122, 91, 0.1)",
                        color: "#167a5b",
                        border: "1.2px solid rgba(22, 122, 91, 0.3)",
                        fontSize: "12.5px",
                        fontWeight: 700,
                         cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {`Sign in with a ${roleDef.title} account`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: "14px 24px",
            background: "rgba(0, 0, 0, 0.02)",
            borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            fontSize: "12px",
            color: "var(--text-secondary, #64748b)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div>
            <strong>RBAC Enforcement:</strong> Backend endpoints validate roles via cryptographic JWT claims. A different role requires signing in with your own authorized account.
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(0, 0, 0, 0.15)",
              background: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
}
