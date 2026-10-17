import type { Contract } from "@tether/schema";
import type { EngineState } from "./state";

/**
 * TODO(cohesion): separated = farther than thresholds.separation_m from every other member for
 * thresholds.separation_min. Needs a per-person `apartSince` in PersonState and a ladder trigger.
 * Until then only the instantaneous check in signals.ts is used.
 */
export const separatedFor = (_contract: Contract, _state: EngineState, _id: string, _now: number): number => {
  throw new Error("cohesion not implemented");
};
