import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Who this phone is for which night. Auth is out of scope: the night code (the contract id) plus a
 * member name is the whole identity, kept on this phone only.
 */
export interface Identity {
  role: "planner" | "friend";
  contractId: string;
  personId: string;
}
const KEY = "bathroombestie.identity";

export async function loadIdentity(): Promise<Identity | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Identity) : null;
}
export const saveIdentity = (i: Identity) =>
  AsyncStorage.setItem(KEY, JSON.stringify(i)).catch(() => undefined);
export const clearIdentity = () => AsyncStorage.removeItem(KEY).catch(() => undefined);
