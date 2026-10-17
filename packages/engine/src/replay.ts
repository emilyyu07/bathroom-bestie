import type { Alert, Contract, EvidenceReport, FriendAction } from "@bathroombestie/schema";
import { evaluate } from "./evaluate";
import { initialState, type EngineState } from "./state";

export interface ReplayInput {
  contract: Contract;
  /** The complete append-only logs. Items are delivered at max(window.start, t). */
  evidence: EvidenceReport[];
  actions: FriendAction[];
  /** Fold minute by minute up to and including this minute. */
  to: number;
  /** Called after every minute (e.g. to record traces). */
  onTick?: (now: number, state: EngineState, alerts: Alert[]) => void;
}

/**
 * Derives engine state (and every alert) purely from the logs by evaluating each minute from the
 * start of the window. This is what makes "state is derived" (invariant 2) true: the cache can
 * always be thrown away and rebuilt, and recorded nights replay identically.
 */
export function replay({ contract, evidence, actions, to, onTick }: ReplayInput): {
  state: EngineState;
  alerts: Alert[];
} {
  const start = contract.window.start;
  const bucket = <T extends { t: number }>(xs: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of xs) {
      if (x.t > to) continue;
      const k = Math.max(start, x.t);
      (m.get(k) ?? m.set(k, []).get(k)!).push(x);
    }
    return m;
  };
  const ev = bucket(evidence);
  const ac = bucket(actions);
  let state = initialState(contract);
  const alerts: Alert[] = [];
  for (let now = start; now <= to; now++) {
    const r = evaluate({
      contract,
      state,
      evidence: ev.get(now) ?? [],
      actions: ac.get(now) ?? [],
      now,
    });
    state = r.state;
    alerts.push(...r.alerts);
    onTick?.(now, state, r.alerts);
  }
  return { state, alerts };
}

/** State only; used when a cached engine state is from an older engine version. */
export const rebuild = (input: Omit<ReplayInput, "onTick">): EngineState => replay(input).state;
