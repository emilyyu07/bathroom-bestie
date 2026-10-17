import { Platform } from "react-native";

// Where the API is, per platform: the Android emulator reaches the host at 10.0.2.2; a browser and
// the iOS Simulator (which shares the host's network) use localhost. EXPO_PUBLIC_API_URL overrides
// all of them (e.g. the host's LAN address when the API runs on another machine).
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000");

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok && r.status !== 409) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const nowMinute = () => Math.floor(Date.now() / 60000);
