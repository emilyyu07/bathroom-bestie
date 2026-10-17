import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { nowMinute, post } from "./api";

const round = (n: number) => Math.round(n * 1000) / 1000; // ~100 m, before it ever leaves the phone

/**
 * Posts coarse location, battery and motion on a timer while the app is open.
 *
 * TODO(android): real background behaviour needs a development build (not Expo Go):
 *  - run this inside a foreground service (expo-location startLocationUpdatesAsync with
 *    foregroundService notification) instead of setInterval;
 *  - register a geofence region for home (Location.startGeofencingAsync) and send ONLY
 *    `homeArrived: true` on enter. Home coordinates must never be sent to the server;
 *  - handle permission revocation by sending permissionOk:false once, then stop.
 */
/**
 * Sends one evidence report. Returns false if nothing was sent: with permission but no position
 * fix yet, sending a made-up (0, 0) would look like she left the area. Without permission the
 * report still goes out (permissionOk: false); the engine ignores its location.
 */
export async function sendEvidenceOnce(personId: string, contractId: string): Promise<boolean> {
  const perm = await Location.getForegroundPermissionsAsync();
  const [pos, level, state] = await Promise.all([
    perm.granted ? currentPosition() : null,
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
  ]);
  if (perm.granted && !pos) return false;
  const speed = pos?.coords.speed ?? 0; // m/s
  await post("/evidence", {
    personId,
    contractId,
    t: nowMinute(),
    area: { lat: round(pos?.coords.latitude ?? 0), lon: round(pos?.coords.longitude ?? 0) },
    motion: speed > 5 ? "vehicle" : speed > 0.5 ? "walking" : "still",
    batteryPct: Math.round(level * 100),
    charging: state === Battery.BatteryState.CHARGING,
    permissionOk: perm.granted,
  });
  return true;
}

/** Last known position, else a fresh fix (bounded so a stuck GPS can't hang the caller). */
async function currentPosition(): Promise<Location.LocationObject | null> {
  const last = await Location.getLastKnownPositionAsync();
  if (last) return last;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    timeout,
  ]).catch(() => null);
}

export function startEvidenceReporter(opts: {
  personId: string;
  contractId: string;
  everyMs?: number;
}) {
  const send = () => sendEvidenceOnce(opts.personId, opts.contractId);
  void send().catch(() => undefined);
  const h = setInterval(() => void send().catch(() => undefined), opts.everyMs ?? 5 * 60_000);
  return () => clearInterval(h);
}
