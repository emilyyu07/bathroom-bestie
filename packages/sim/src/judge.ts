import type { ScenarioFile } from "@tether/schema";
import type { RunResult } from "./runner";

export interface Verdict {
  expected: string;
  actual: string;
  /** Minutes from the labeled onset to the first qualifying alert. */
  timeToAlert: number | null;
  pass: boolean;
}

export function judge(sc: ScenarioFile, r: RunResult): Verdict {
  const start = sc.contract.window.start;
  const l = sc.label;
  if (l.expect === "activation_blocked") {
    const blocked = r.readiness?.state === "not_ready";
    return { expected: "activation blocked", actual: r.readiness ? r.readiness.state : "no snapshot", timeToAlert: null, pass: blocked };
  }
  if (l.expect === "no_alert") {
    return { expected: "no alert", actual: r.alerts.length ? `${r.alerts.length} alert(s)` : "no alert", timeToAlert: null, pass: r.alerts.length === 0 };
  }
  const first = r.alerts.find((a) => a.rung >= l.rung);
  const t = first ? first.t - start : null;
  const maxRung = Math.max(0, ...r.alerts.map((a) => a.rung));
  const inWindow = t !== null && t >= l.from && t <= l.to;
  const okMax = l.maxRung === undefined || maxRung <= l.maxRung;
  const okResolved = !l.resolvedBy || r.state.incidents.some((i) => i.resolution === l.resolvedBy);
  return {
    expected: `rung>=${l.rung} in [${l.from},${l.to}]${l.maxRung ? ` max ${l.maxRung}` : ""}${l.resolvedBy ? ` ${l.resolvedBy}` : ""}`,
    actual: first ? `rung ${first.rung} @${t}${okResolved ? "" : " unresolved"}` : "no alert",
    timeToAlert: t === null ? null : t - l.onset,
    pass: inWindow && okMax && okResolved,
  };
}
