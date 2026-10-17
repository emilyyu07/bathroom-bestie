import type { Contract } from "@tether/schema";
import type { PersonState } from "./state";

export interface ConfidenceResult {
  n: number;
  penalties: { stream: "corridor" | "movement" | "freshness"; penalty: number; minutes: number }[];
}

/** N(t) = exp(-sum_i w_i * max(0, (t - t_i)/tau_i - 1)). Pure; weights come from the contract. */
export const confidenceOfNormal = (
  contract: Contract,
  p: PersonState,
  now: number,
): ConfidenceResult => {
  const m = contract.confidence;
  const lastFresh = p.lastReportAt ?? contract.window.start;
  const streams = [
    { stream: "corridor", t: p.lastCorridorAt, ...m.corridor },
    { stream: "movement", t: p.lastMoveAt, ...m.movement },
    { stream: "freshness", t: lastFresh, ...m.freshness },
  ] as const;
  const penalties = streams.map((s) => ({
    stream: s.stream,
    minutes: Math.max(0, now - s.t),
    penalty: s.w * Math.max(0, (now - s.t) / s.tau_min - 1),
  }));
  const total = penalties.reduce((a, b) => a + b.penalty, 0);
  return { n: Math.exp(-total), penalties };
};
