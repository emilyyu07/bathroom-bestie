import { Linking, Platform } from "react-native";
import { get, send } from "./api";

/** Mirrors apps/api/src/emergency.ts (the mobile app is outside the workspace). */
export interface EmergencyContact {
  name: string;
  phone: string;
}
export interface EmergencyNotice {
  alertId: string;
  about: string;
  at: number;
  /** Demo only: BathroomBestie never actually texts anyone. */
  due: boolean;
  message: string;
}

const path = (contractId: string) =>
  `/contracts/${encodeURIComponent(contractId)}/emergency-contact`;

export const loadEmergency = (contractId: string) =>
  get<{ contact: EmergencyContact | null; notice: EmergencyNotice | null }>(path(contractId));
export const saveContact = (contractId: string, c: EmergencyContact) =>
  send<{ contact: EmergencyContact }>("PUT", path(contractId), c);
export const clearContact = (contractId: string) => send("DELETE", path(contractId));

/** The text a friend can send her contact from their own phone. Fixed wording; the friend decides. */
export const friendText = (contact: string, friend: string, her: string) =>
  `Hi ${contact}, it's ${friend}. I'm out with ${her} tonight and I'm worried about her. ` +
  `Can you try to reach her?`;

/** Opens the friend's own phone or messages app. Nothing is dialled or sent automatically. */
export const callContact = (c: EmergencyContact) =>
  Linking.openURL(`tel:${c.phone.replace(/[^0-9+]/g, "")}`);
export const textContact = (c: EmergencyContact, body: string) =>
  Linking.openURL(
    `sms:${c.phone.replace(/[^0-9+]/g, "")}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`,
  );
