import type { ConfidenceModel } from "./contract";
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
  };
};

/** Starting weights; calibrate with the sweep. */
export const DEFAULT_CONFIDENCE: ConfidenceModel = {
  corridor: { w: 1, tau_min: 20 },
  movement: { w: 0.6, tau_min: 25 },
  freshness: { w: 1, tau_min: 10 },
};
