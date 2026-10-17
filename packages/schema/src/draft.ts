import { z } from "zod";
import { PresetName } from "./preset";

/**
 * What Gemini fills in at setup. Deliberately smaller than Contract: ids, thresholds and
 * clock arithmetic are derived deterministically by buildContract (apps/api), never by the model.
 */
export const DraftPlan = z.object({
  friends: z.array(z.string().min(1)).min(1).describe("Names of friends going out with her"),
  hours: z.number().min(1).max(14).describe("Hours from now until the night ends"),
  radius_m: z.number().min(300).max(10000).describe("How far the night is expected to range"),
  preset: PresetName.describe("relaxed, standard or cautious"),
  watch_order: z
    .array(z.string())
    .describe("Friends in the order they should watch; subset of friends"),
  offer_911_script: z.boolean(),
  read_back: z.string().describe("2-3 plain sentences repeating the plan back to her"),
});
export type DraftPlan = z.infer<typeof DraftPlan>;
