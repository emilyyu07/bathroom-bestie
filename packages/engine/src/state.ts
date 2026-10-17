import type { Contract, Minute } from "@tether/schema";

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
  cooldownUntil: Minute | null;
  /** Last accepted worry time per friend (rate limit). */
  worryAt: Record<string, Minute>;
}

export type IncidentKind = "low_confidence" | "unexplained_stop" | "evidence_lost" | "friend_worry";

/** self -> watcher -> next -> group are the automatic steps; friend = a human took over. */
export type IncidentStep = "self" | "watcher" | "next" | "group" | "friend";

export interface Incident {
  id: string;
  personId: string;
  kind: IncidentKind;
  rung: 1 | 2 | 3 | 4;
  step: IncidentStep;
  openedAt: Minute;
  rungSince: Minute;
  status: "open" | "resolved";
  raisedBy?: string;
  reason?: string;
  resolvedAt?: Minute;
  resolution?: "evidence_returned" | "confirmed" | "home";
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

export interface EngineState {
  people: Record<string, PersonState>;
  incidents: Incident[];
  actionLog: ActionLogEntry[];
  notes: SoftNote[];
  lastEvalAt: Minute | null;
}

export const COOLDOWN_MIN = 30;
export const WORRY_RATE_LIMIT_MIN = 15;

export const initialState = (contract: Contract): EngineState => ({
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
