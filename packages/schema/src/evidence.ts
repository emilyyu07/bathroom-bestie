import { z } from "zod";
import { Minute, PersonId, RoundedArea } from "./common";

export const Motion = z.enum(["still", "walking", "vehicle"]);
export type Motion = z.infer<typeof Motion>;

export const EvidenceReport = z.object({
  personId: PersonId,
  contractId: z.string(),
  t: Minute,
  /** Coarse (~100 m). Rounded on parse. */
  area: RoundedArea,
  motion: Motion,
  batteryPct: z.number().min(0).max(100),
  charging: z.boolean(),
  permissionOk: z.boolean(),
  /** Device-side home geofence fired. The server never sees home coordinates. */
  homeArrived: z.boolean().optional(),
});
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
