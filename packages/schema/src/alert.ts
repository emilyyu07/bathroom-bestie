import { z } from "zod";
import { Minute, PersonId, RoundedArea } from "./common";

export const AlertKind = z.enum([
  "low_confidence",
  "unexplained_stop",
  "evidence_lost",
  "missed_milestone",
  "friend_worry",
  "separation",
  "exit_alone",
  "escalation",
]);
export type AlertKind = z.infer<typeof AlertKind>;

export const Alert = z.object({
  id: z.string(),
  contractId: z.string(),
  incidentId: z.string(),
  rung: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  kind: AlertKind,
  personId: PersonId,
  t: Minute,
  /** Who receives it. Rung 1 goes to the person herself. */
  to: z.array(PersonId),
  /** Top three plain-language factors. */
  factors: z.array(z.string()).max(3),
  /** Rounded and historical, never live. */
  lastKnown: z.object({ area: RoundedArea, t: Minute }).nullable(),
  /** The friend who raised it, if any. */
  raisedBy: PersonId.optional(),
  /** Fixed-template text. */
  message: z.string(),
  /** Shown to a friend at rung 4 only if the contract wishes allow. Never auto-dialled. */
  script911: z.string().optional(),
});
export type Alert = z.infer<typeof Alert>;
