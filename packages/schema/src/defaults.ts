import type { ConfidenceModel } from "./contract";
import { DEFAULT_REPORT_EVERY_MIN } from "./common";
import { PRESETS, type PresetName } from "./preset";
import type { Thresholds } from "./contract";

/** Build thresholds from a preset; used by compile and by the sweep to swap presets. */
export const thresholdsFor = (preset: PresetName, prev?: Thresholds): Thresholds => {
  const p = PRESETS[preset];
  return {
    separation_m: prev?.separation_m ?? 150,
    watch_slot_min: prev?.watch_slot_min ?? 90,
    separation_min: p.separation_min,
    silence_min: p.silence_min,
    score_floor: p.score_floor,
    score_floor_min: p.score_floor_min,
    ack_timeout_min: p.ack_timeout_min,
    milestone_grace_min: p.milestone_grace_min,
    exit_alone_min: p.exit_alone_min,
    report_every_min: prev?.report_every_min ?? DEFAULT_REPORT_EVERY_MIN,
  };
};

/**
 * Timers for a demo night, so the whole story (apart, alone, a friend alerted) plays in minutes on
 * a real phone. Same engine, different contract data (invariant 7); the contract carries
 * `demo: true` and the plan screen says so. Spatial thresholds are unchanged.
 */
export const DEMO_THRESHOLDS: Thresholds = {
  separation_m: 150,
  watch_slot_min: 90,
  separation_min: 2,
  silence_min: 3,
  score_floor: 0.5,
  score_floor_min: 3,
  ack_timeout_min: 1,
  milestone_grace_min: 1,
  exit_alone_min: 3,
  report_every_min: 1,
};

/** Starting weights; calibrate with the sweep. */
export const DEFAULT_CONFIDENCE: ConfidenceModel = {
  corridor: { w: 1, tau_min: 20 },
  movement: { w: 0.5, tau_min: 90 },
  freshness: { w: 1, tau_min: 10 },
  separation: { w: 0.4, tau_min: 60, cap: 0.4 },
};

import type { Contract } from "./contract";

/** Test/sim helper: a valid contract around downtown Toronto. Window starts at minute 0. */
export const makeContract = (over: Partial<Contract> = {}): Contract => ({
  id: "c1",
  corridor: { center: { lat: 43.65, lon: -79.38 }, radius_m: 2000 },
  window: { start: 0, end: 360 },
  milestones: [],
  group: {
    members: ["ana", "bea", "cy"],
    watch: [
      { who: "bea", from: 0, to: 180 },
      { who: "cy", from: 180, to: 360 },
    ],
  },
  thresholds: thresholdsFor("standard"),
  confidence: DEFAULT_CONFIDENCE,
  preset: "standard",
  wishes: { alert_order: ["bea", "cy"], offer_911_script: true },
  expires: 480,
  ...over,
});
