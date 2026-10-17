import type { Contract } from "@bathroombestie/schema";
import { wasSeparatedAtLastReport } from "./cohesion";
import type { EngineState } from "./state";

export type SilenceClass = "none" | "quiet" | "battery_death" | "unexplained" | "evidence_lost";

export const silentMinutes = (contract: Contract, state: EngineState, id: string, now: number) => {
  const p = state.people[id]!;
  return now - (p.lastReportAt ?? contract.window.start);
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
  if (b !== null && b > 20 && wasSeparatedAtLastReport(contract, state, id)) return "unexplained";
  return "quiet";
};
