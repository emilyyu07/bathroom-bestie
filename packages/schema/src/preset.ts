import { z } from "zod";

export const PresetName = z.enum(["relaxed", "standard", "cautious"]);
export type PresetName = z.infer<typeof PresetName>;

export const SensitivityPreset = z.object({
  name: PresetName,
  separation_min: z.number().positive(),
  silence_min: z.number().positive(),
  score_floor: z.number().min(0).max(1),
  score_floor_min: z.number().positive(),
  ack_timeout_min: z.number().positive(),
  /** How long past a milestone deadline before it counts as missed. */
  milestone_grace_min: z.number().nonnegative(),
  /** Minutes she may be away from the group before getting home / rejoining is overdue. */
  exit_alone_min: z.number().positive(),
});
export type SensitivityPreset = z.infer<typeof SensitivityPreset>;

/** Starting points to calibrate with the sweep. These are data, not logic. */
export const PRESETS: Record<PresetName, SensitivityPreset> = {
  relaxed: {
    name: "relaxed",
    separation_min: 40,
    silence_min: 30,
    score_floor: 0.4,
    score_floor_min: 15,
    ack_timeout_min: 7,
    milestone_grace_min: 20,
    exit_alone_min: 60,
  },
  standard: {
    name: "standard",
    separation_min: 25,
    silence_min: 20,
    score_floor: 0.5,
    score_floor_min: 10,
    ack_timeout_min: 5,
    milestone_grace_min: 10,
    exit_alone_min: 45,
  },
  cautious: {
    name: "cautious",
    separation_min: 15,
    silence_min: 12,
    score_floor: 0.6,
    score_floor_min: 6,
    ack_timeout_min: 3,
    milestone_grace_min: 5,
    exit_alone_min: 30,
  },
};
export const PRESET_ORDER: PresetName[] = ["relaxed", "standard", "cautious"];
