import { z } from "zod";
import { Circle, DEFAULT_REPORT_EVERY_MIN, Minute, PersonId } from "./common";
import { PresetName } from "./preset";

const MilestoneBase = {
  id: z.string(),
  /** Deadline (minute). */
  by: Minute,
  /** Who it applies to. Omitted = every member; compile writes ["me"] so friends are not held to it. */
  who: z.array(PersonId).optional(),
};

/**
 * Locations are rounded to ~110 m before the engine sees them, so a circle smaller than about one
 * grid cell cannot be reliably entered. Area milestones need at least this radius.
 */
export const MIN_AREA_RADIUS_M = 200;

/**
 * A promise she made about the night.
 *  - area: be inside `within` by `by`.
 *  - home: the phone's home geofence must have fired by `by`. Needs a device-side geofence, so a
 *    contract with a home milestone makes the pre-flight geofence check blocking.
 */
export const Milestone = z.discriminatedUnion("kind", [
  z.object({
    ...MilestoneBase,
    kind: z.literal("area"),
    within: Circle.extend({ radius_m: z.number().min(MIN_AREA_RADIUS_M) }),
  }),
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
  /** How often her phone reports while a night is active. Read by the app; used by the sim and checks. */
  report_every_min: z.number().int().positive().default(DEFAULT_REPORT_EVERY_MIN),
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

export const Contract = z
  .object({
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
    /** A rehearsal night: timers are minutes, not tens of minutes (DEMO_THRESHOLDS). Always shown to her. */
    demo: z.boolean().optional(),
  })
  .refine(
    (c) =>
      c.expires >=
      Math.max(c.window.end, ...c.milestones.map((m) => m.by + c.thresholds.milestone_grace_min)),
    {
      path: ["expires"],
      message:
        "expires must cover the end of the window and every milestone deadline plus its grace, or the engine stops watching before the deadline can be judged",
    },
  )
  .refine((c) => c.thresholds.silence_min >= 2 * c.thresholds.report_every_min, {
    path: ["thresholds", "silence_min"],
    message:
      "silence_min must be at least two report intervals, or a single late report would count as silence",
  });
export type Contract = z.infer<typeof Contract>;
export type Thresholds = z.infer<typeof Thresholds>;
