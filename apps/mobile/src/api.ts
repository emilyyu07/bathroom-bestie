import { Platform } from "react-native";

// The Android emulator reaches the host at 10.0.2.2; a browser (expo start --web) uses localhost.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" ? "http://localhost:3000" : "http://10.0.2.2:3000");

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok && r.status !== 409) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const nowMinute = () => Math.floor(Date.now() / 60000);
