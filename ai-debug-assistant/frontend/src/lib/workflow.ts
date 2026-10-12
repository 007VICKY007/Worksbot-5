import type { TestStep } from "./types";

export function normalizeGeneratedSteps(value: unknown): TestStep[] {
  const steps = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n").filter(s => s.trim()) : [];
  return steps.map((step, index) => {
    const record = step && typeof step === "object" ? step as Record<string, unknown> : {};
    return {
      step_number: index + 1,
      action: typeof step === "string" ? step : String(record.action ?? record.description ?? record.step ?? ""),
      expected: String(record.expected ?? record.expected_result ?? ""),
    };
  });
}
