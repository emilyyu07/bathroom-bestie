import type { Ctx } from "./ctx";
import type { SilenceClass } from "./signals";
import type { IncidentKind, Severity } from "./state";

export type { Severity } from "./state";

/** The severity a detector gives its concern by default. A detector may override it per tick. */
export const SEVERITY: Record<IncidentKind, Severity> = {
  low_confidence: "hard",
  unexplained_stop: "hard",
  friend_worry: "hard",
  separation: "advisory",
  evidence_lost: "notice",
};

export interface Concern {
  kind: IncidentKind;
  severity: Severity;
}
const concern = (kind: IncidentKind, severity: Severity = SEVERITY[kind]): Concern => ({
  kind,
  severity,
});

/** Per-person readings for this tick, computed once by `observe` and read by every detector. */
export interface Signals {
  cls: SilenceClass;
  /** Confidence of normal, 0..1. */
  n: number;
  silentMin: number;
  apartMin: number;
}

/** null = no concern here; "suppress" = known benign explanation, stop and raise nothing. */
export type Verdict = Concern | "suppress" | null;
export type Detector = (ctx: Ctx, id: string, s: Signals) => Verdict;

const evidenceLost: Detector = (_c, _id, s) =>
  s.cls === "evidence_lost" ? concern("evidence_lost") : null;

const batteryDeath: Detector = (_c, _id, s) => (s.cls === "battery_death" ? "suppress" : null);

const unexplainedStop: Detector = (_c, _id, s) =>
  s.cls === "unexplained" ? concern("unexplained_stop") : null;

const lowConfidence: Detector = ({ contract, state, now }, id) => {
  const p = state.people[id]!;
  return p.lowSince !== null && now - p.lowSince >= contract.thresholds.score_floor_min
    ? concern("low_confidence")
    : null;
};

const separation: Detector = ({ contract }, _id, s) =>
  // Only nudge her while she is reachable.
  s.silentMin < contract.thresholds.silence_min && s.apartMin >= contract.thresholds.separation_min
    ? concern("separation")
    : null;

/** Priority order: the first detector with an opinion wins. Add new detectors here. */
export const DETECTORS: Detector[] = [
  evidenceLost,
  batteryDeath,
  unexplainedStop,
  lowConfidence,
  separation,
];

export function detectConcern(ctx: Ctx, id: string, s: Signals): Concern | null {
  for (const d of DETECTORS) {
    const v = d(ctx, id, s);
    if (v === "suppress") return null;
    if (v) return v;
  }
  return null;
}
