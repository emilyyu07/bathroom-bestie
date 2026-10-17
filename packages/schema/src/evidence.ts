import { z } from "zod";
import { Minute, PersonId, RoundedArea } from "./common";

export const Motion = z.enum(["still", "walking", "vehicle"]);
export type Motion = z.infer<typeof Motion>;

/** Shape shared by reports and scenario evidence; `.omit` needs the unrefined object. */
export const EvidenceBase = z.object({
  personId: PersonId,
  contractId: z.string(),
  t: Minute,
  /**
   * Coarse (~100 m), rounded on parse. Required on every report except an arrival: an arrival is
   * an event, not a place, so it carries no location (invariant 5).
   */
  area: RoundedArea.optional(),
  motion: Motion,
  batteryPct: z.number().min(0).max(100),
  charging: z.boolean(),
  permissionOk: z.boolean(),
  /**
   * Device-side proximity to home was detected. The server learns only that she arrived, never
   * where home is: an arrival report omits `area`, and the API drops one if a client sends it.
   */
  homeArrived: z.boolean().optional(),
});

/** Every report needs a location except an arrival. */
export const needsArea = (e: { area?: unknown; homeArrived?: boolean }) =>
  e.area !== undefined || e.homeArrived === true;
export const NEEDS_AREA = {
  path: ["area"],
  message: "area is required unless this is an arrival report (homeArrived)",
};

export const EvidenceReport = EvidenceBase.refine(needsArea, NEEDS_AREA);
export type EvidenceReport = z.infer<typeof EvidenceReport>;

export const FriendReason = z.enum(["cant_find", "not_answering", "feels_off"]);
export type FriendReason = z.infer<typeof FriendReason>;

export const FriendAction = z.object({
  type: z.enum(["confirm", "worry"]),
  by: PersonId,
  targetPersonId: PersonId,
  t: Minute,
  reason: FriendReason.optional(),
});
export type FriendAction = z.infer<typeof FriendAction>;
