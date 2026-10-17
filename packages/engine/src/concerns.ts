import type { Ctx } from "./ctx";
import type { SilenceClass } from "./signals";
import type { IncidentKind } from "./state";

/**
 * How a kind of incident behaves on the ladder:
 *  - hard:     climbs rungs on ack timeouts until a human or returning evidence ends it
 *  - advisory: a nudge to her only; never reaches friends alone, but upgrades in place the moment
 *              a different concern appears (the ack timeout then counts from the upgrade)
 *  - notice:   told once and never escalates (e.g. a permission turned off)
 */
export type Severity = "hard" | "advisory" | "notice";

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
const concern = (kind: IncidentKind): Concern => ({ kind, severity: SEVERITY[kind] });

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
