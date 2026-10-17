export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"; // Android emulator -> host

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
