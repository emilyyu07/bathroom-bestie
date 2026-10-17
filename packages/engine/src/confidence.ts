import type { Contract } from "@bathroombestie/schema";
import type { PersonState } from "./state";

export interface ConfidenceResult {
  n: number;
  penalties: {
    stream: "corridor" | "movement" | "freshness" | "separation";
    penalty: number;
    minutes: number;
  }[];
}

/**
 * N(t) = exp(-sum_i w_i * max(0, x_i/tau_i - 1)), where x_i is the minutes since stream i was last
 * good (corridor, movement, freshness) or, for separation, the minutes she has been apart.
 * Pure; weights come from the contract. `apartMin` comes from cohesion.separatedFor.
 */
export const confidenceOfNormal = (
  contract: Contract,
  p: PersonState,
  now: number,
  apartMin = 0,
): ConfidenceResult => {
  const m = contract.confidence;
  const lastFresh = p.lastReportAt ?? contract.window.start;
  const streams: {
    stream: ConfidenceResult["penalties"][number]["stream"];
    x: number;
    w: number;
    tau_min: number;
    cap?: number;
  }[] = [
    { stream: "corridor", x: now - p.lastCorridorAt, ...m.corridor },
    { stream: "movement", x: now - p.lastMoveAt, ...m.movement },
    { stream: "freshness", x: now - lastFresh, ...m.freshness },
  ];
  // Older stored contracts predate the separation stream.
  if (m.separation) streams.push({ stream: "separation", x: apartMin, ...m.separation });
  const penalties = streams.map((s) => {
    const raw = s.w * Math.max(0, s.x / s.tau_min - 1);
    return {
      stream: s.stream,
      minutes: Math.max(0, s.x),
      penalty: s.cap === undefined ? raw : Math.min(raw, s.cap),
    };
  });
  const total = penalties.reduce((a, b) => a + b.penalty, 0);
  return { n: Math.exp(-total), penalties };
};
