import type { Ctx } from "./ctx";
import { overdue } from "./milestones";
import type { SilenceClass } from "./signals";
import type { IncidentKind, Severity } from "./state";

export type { Severity } from "./state";

/** The severity a detector gives its concern by default. A detector may override it per tick. */
export const SEVERITY: Record<IncidentKind, Severity> = {
  low_confidence: "hard",
  unexplained_stop: "hard",
  friend_worry: "hard",
  separation: "advisory",
  missed_milestone: "advisory",
  exit_alone: "hard",
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

/**
 * She left the group alone, is still apart, and has neither got home nor rejoined within
 * `exit_alone_min`. Nobody has confirmed she is safe, so this is hard from the start (decided).
 * Armed only for people a home milestone applies to (the clock is never started otherwise).
 */
const exitAloneOverdue: Detector = ({ contract, state, now }, id) => {
  const since = state.people[id]!.exitAloneSince;
  return since !== null && now > since + contract.thresholds.exit_alone_min
    ? concern("exit_alone")
    : null;
};

/**
 * Past a deadline she set. Advisory (a nudge to her) while she is still reporting; hard once her
 * phone has also gone quiet: late AND silent are two independent signals, so it climbs the ladder
 * without waiting for the score path (and covers the case where she was last seen with the group).
 */
const missedMilestone: Detector = ({ contract, state, now }, id, s) =>
  overdue(contract, state.people[id]!, id, now).length === 0
    ? null
    : concern(
        "missed_milestone",
        s.silentMin >= contract.thresholds.silence_min ? "hard" : "advisory",
      );

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
  exitAloneOverdue,
  missedMilestone,
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
