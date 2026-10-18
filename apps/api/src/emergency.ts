import type { Alert, Contract, FriendAction } from "@bathroombestie/schema";
import { z } from "zod";

/**
 * The planner's emergency contact: someone she picks (a parent, a roommate), never an authority
 * (invariant 4). Friends see the name and number all night so they can call or text themselves.
 *
 * If a top-rung alert about her gets no response from any friend, BathroomBestie would text this
 * person. That message is DEMO ONLY: it is built from a fixed template and shown (on the friends'
 * alert cards and backstage), and nothing is ever sent.
 */
export const EmergencyContact = z.object({
  name: z.string().trim().min(1).max(40),
  // Digits with the usual separators; the friend's phone dials or texts it as typed.
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ().-]{7,20}$/, "a phone number"),
});
export type EmergencyContact = z.infer<typeof EmergencyContact>;

export interface EmergencyNotice {
  /** The top-rung alert this is about. */
  alertId: string;
  about: string;
  /** When the message would go out: the alert's minute plus the contract's ack_timeout_min. */
  at: number;
  /** True once `at` has passed with no friend response. Demo only: nothing is sent either way. */
  due: boolean;
  message: string;
}

/** Fixed template (invariant 3): observable facts only, no inference about why. */
export const contactMessage = (
  contact: EmergencyContact,
  owner: string,
  waitedMin: number,
  lastKnown: Alert["lastKnown"],
): string =>
  `Hi ${contact.name}, this is BathroomBestie, a safety app ${owner} uses on nights out. ` +
  `Her friends were alerted about her and none of them has responded in ${waitedMin} min. ` +
  (lastKnown
    ? `Her last known area (about 100 m): https://maps.google.com/?q=${lastKnown.area.lat},${lastKnown.area.lon} . `
    : "") +
  `You're her emergency contact. Please try to reach her. BathroomBestie never calls anyone.`;

/**
 * The message BathroomBestie would send her emergency contact now, if any. Pure over its inputs.
 * Only the newest top-rung alert about the planner counts. A friend responds by sending "I'm with
 * her" or "I'm worried" about her after it; the "I'm worried" that raised it does not count.
 */
export function emergencyNotice(
  contract: Contract,
  contact: EmergencyContact | null,
  alerts: Alert[],
  actions: FriendAction[],
  now: number,
  /** False for the presenter's backstage view, which carries no location of any kind. */
  withArea = true,
): EmergencyNotice | null {
  const owner = contract.group.members[0]!;
  if (!contact) return null;
  const top = alerts
    .filter((a) => a.rung === 4 && a.personId === owner)
    .sort((a, b) => b.t - a.t)[0];
  if (!top) return null;
  const responded = actions.some(
    (x) =>
      x.targetPersonId === owner &&
      x.by !== owner &&
      x.t >= top.t &&
      !(x.t === top.t && x.by === top.raisedBy && x.type === "worry"),
  );
  if (responded) return null;
  const wait = contract.thresholds.ack_timeout_min;
  return {
    alertId: top.id,
    about: owner,
    at: top.t + wait,
    due: now >= top.t + wait,
    message: contactMessage(contact, owner, wait, withArea ? top.lastKnown : null),
  };
}
