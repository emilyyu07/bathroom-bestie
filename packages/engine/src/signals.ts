import { distanceM, type Contract } from "@tether/schema";
import type { EngineState } from "./state";

export type SilenceClass = "none" | "quiet" | "battery_death" | "unexplained" | "evidence_lost";

export const silentMinutes = (contract: Contract, state: EngineState, id: string, now: number) => {
  const p = state.people[id]!;
  return now - (p.lastReportAt ?? contract.window.start);
};

/**
 * Instantaneous "apart": farther than separation_m from every other member's last-known area.
 * TODO(cohesion): the duration rule (separation_min) lives in cohesion.ts and is still stubbed.
 */
export const isApart = (contract: Contract, state: EngineState, id: string): boolean => {
  const me = state.people[id]?.lastArea;
  if (!me) return true;
  const others = contract.group.members.filter((m) => m !== id);
  return others.every((o) => {
    const a = state.people[o]?.lastArea;
    return !a || distanceM(me, a) > contract.thresholds.separation_m;
  });
};

export const classifySilence = (
  contract: Contract,
  state: EngineState,
  id: string,
  now: number,
): SilenceClass => {
  const p = state.people[id]!;
  if (p.permissionLost) return "evidence_lost";
  if (silentMinutes(contract, state, id, now) < contract.thresholds.silence_min) return "none";
  const b = p.lastBattery;
  if (b !== null && b <= 5) {
    const falling = p.prevBattery === null || b <= p.prevBattery;
    if (falling && !p.lastCharging) return "battery_death";
  }
  if (b !== null && b > 20 && isApart(contract, state, id)) return "unexplained";
  return "quiet";
};
