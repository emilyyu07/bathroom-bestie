import type { Contract, Minute } from "@bathroombestie/schema";

export interface PersonState {
  lastReportAt: Minute | null;
  lastArea: { lat: number; lon: number } | null;
  lastCorridorAt: Minute;
  lastMoveAt: Minute;
  lastBattery: number | null;
  prevBattery: number | null;
  lastCharging: boolean;
  permissionLost: boolean;
  home: boolean;
  /** First minute N dropped below the floor in the current dip; null when above it. */
  lowSince: Minute | null;
  /** Since when she has been apart from every fresh peer. Frozen while she is silent; null if together. */
  apartSince: Minute | null;
  cooldownUntil: Minute | null;
  /** Last accepted worry time per friend (rate limit). */
  worryAt: Record<string, Minute>;
}

export type IncidentKind =
  "low_confidence" | "unexplained_stop" | "evidence_lost" | "friend_worry" | "separation";

/**
 * How an incident behaves on the ladder. Stored ON the incident (not looked up by kind) so the same
 * kind can be advisory while she is reachable and hard once she is quiet:
 *  - hard:     climbs rungs on ack timeouts until a human or returning evidence ends it
 *  - advisory: a nudge to her only; never reaches friends alone, but upgrades in place the moment a
 *              hard concern appears (the ack timeout then counts from the upgrade)
 *  - notice:   told once and never escalates (e.g. a permission turned off)
 */
export type Severity = "hard" | "advisory" | "notice";

/** self -> watcher -> next -> group are the automatic steps; friend = a human took over. */
export type IncidentStep = "self" | "watcher" | "next" | "group" | "friend";

export interface Incident {
  id: string;
  personId: string;
  kind: IncidentKind;
  severity: Severity;
  rung: 1 | 2 | 3 | 4;
  step: IncidentStep;
  openedAt: Minute;
  rungSince: Minute;
  status: "open" | "resolved";
  raisedBy?: string;
  reason?: string;
  resolvedAt?: Minute;
  resolution?: "evidence_returned" | "confirmed" | "home" | "rejoined";
  confirmedBy?: string;
}

export interface ActionLogEntry {
  t: Minute;
  type: "confirm" | "worry";
  by: string;
  targetPersonId: string;
  reason?: string;
  outcome: "applied" | "rate_limited" | "ignored";
}

export interface SoftNote {
  t: Minute;
  personId: string;
  text: string;
}

/** Bump whenever PersonState/Incident/EngineState semantics change; stale caches are rebuilt from the logs. */
export const ENGINE_STATE_VERSION = 3;

export interface EngineState {
  version: number;
  people: Record<string, PersonState>;
  incidents: Incident[];
  actionLog: ActionLogEntry[];
  notes: SoftNote[];
  lastEvalAt: Minute | null;
}

export const COOLDOWN_MIN = 30;
export const WORRY_RATE_LIMIT_MIN = 15;

export const initialState = (contract: Contract): EngineState => ({
  version: ENGINE_STATE_VERSION,
  people: Object.fromEntries(
    contract.group.members.map((id) => [
      id,
      {
        lastReportAt: null,
        lastArea: null,
        lastCorridorAt: contract.window.start,
        lastMoveAt: contract.window.start,
        lastBattery: null,
        prevBattery: null,
        lastCharging: false,
        permissionLost: false,
        home: false,
        lowSince: null,
        apartSince: null,
        cooldownUntil: null,
        worryAt: {},
      } satisfies PersonState,
    ]),
  ),
  incidents: [],
  actionLog: [],
  notes: [],
  lastEvalAt: null,
});
