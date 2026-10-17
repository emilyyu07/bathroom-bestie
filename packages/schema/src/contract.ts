import { z } from "zod";
import { Circle, Minute, PersonId } from "./common";
import { PresetName } from "./preset";

const MilestoneBase = {
  id: z.string(),
  /** Deadline (minute). */
  by: Minute,
  /** Who it applies to. Omitted = every member; compile writes ["me"] so friends are not held to it. */
  who: z.array(PersonId).optional(),
};

/**
 * A promise she made about the night.
 *  - area: be inside `within` by `by`.
 *  - home: the phone's home geofence must have fired by `by`. Needs a device-side geofence, so a
 *    contract with a home milestone makes the pre-flight geofence check blocking.
 */
export const Milestone = z.discriminatedUnion("kind", [
  z.object({ ...MilestoneBase, kind: z.literal("area"), within: Circle }),
  z.object({ ...MilestoneBase, kind: z.literal("home") }),
]);
export type Milestone = z.infer<typeof Milestone>;

export const WatchSlot = z.object({ who: PersonId, from: Minute, to: Minute });

export const Thresholds = z.object({
  separation_m: z.number().positive().default(150),
  separation_min: z.number().positive(),
  silence_min: z.number().positive(),
  score_floor: z.number().min(0).max(1),
  score_floor_min: z.number().positive(),
  watch_slot_min: z.number().positive().default(90),
  ack_timeout_min: z.number().positive(),
  milestone_grace_min: z.number().nonnegative(),
  exit_alone_min: z.number().positive(),
});

const Stream = z.object({ w: z.number().nonnegative(), tau_min: z.number().positive() });

/** Confidence-of-normal model parameters. Data, per invariant 7. tau defaults scale with silence_min. */
export const ConfidenceModel = z.object({
  corridor: Stream,
  movement: Stream,
  freshness: Stream,
  /**
   * Long separation from the group. `cap` bounds this stream's penalty so separation alone
   * can lower confidence but never fall below the highest score_floor; it only tips the score
   * when combined with another stream (silence, leaving the area).
   */
  separation: Stream.extend({ cap: z.number().positive().optional() }).default({
    w: 0.4,
    tau_min: 60,
    cap: 0.4,
  }),
});
export type ConfidenceModel = z.infer<typeof ConfidenceModel>;

export const Wishes = z.object({
  alert_order: z.array(PersonId),
  offer_911_script: z.boolean(),
});

export const Contract = z.object({
  id: z.string(),
  corridor: Circle,
  window: z.object({ start: Minute, end: Minute }),
  milestones: z.array(Milestone),
  group: z.object({ members: z.array(PersonId).min(1), watch: z.array(WatchSlot) }),
  thresholds: Thresholds,
  confidence: ConfidenceModel,
  preset: PresetName,
  wishes: Wishes,
  expires: Minute,
});
export type Contract = z.infer<typeof Contract>;
export type Thresholds = z.infer<typeof Thresholds>;
