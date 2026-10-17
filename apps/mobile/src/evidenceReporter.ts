import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { nowMinute, post } from "./api";

const round = (n: number) => Math.round(n * 1000) / 1000; // ~100 m, before it ever leaves the phone

/**
 * Coarse location, battery and motion reports. On Android the night is reported from a
 * foreground service (background.ts); the timer below is the fallback where that can't run (web).
 *
 * TODO(android):
 *  - register a geofence region for home (Location.startGeofencingAsync) and send ONLY
 *    `homeArrived: true` on enter. Home coordinates must never be sent to the server;
 *  - Android kills the app when location permission is revoked, so the next report (on reopen)
 *    is the first chance to send permissionOk:false.
 */
/**
 * Sends one evidence report. Returns false if nothing was sent: with permission but no position
 * fix yet, sending a made-up (0, 0) would look like she left the area. Without permission the
 * report still goes out (permissionOk: false); the engine ignores its location.
 */
export async function sendEvidenceOnce(personId: string, contractId: string): Promise<boolean> {
  const perm = await Location.getForegroundPermissionsAsync();
  const pos = perm.granted ? await currentPosition() : null;
  if (perm.granted && !pos) return false;
  await reportPosition(personId, contractId, pos);
  return true;
}

/** Posts one report for a known position (null = no location permission). Rounds before sending. */
export async function reportPosition(
  personId: string,
  contractId: string,
  pos: Location.LocationObject | null,
): Promise<void> {
  const [level, state] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
  ]);
  const speed = pos?.coords.speed ?? 0; // m/s
  await post("/evidence", {
    personId,
    contractId,
    t: nowMinute(),
    area: { lat: round(pos?.coords.latitude ?? 0), lon: round(pos?.coords.longitude ?? 0) },
    motion: speed > 5 ? "vehicle" : speed > 0.5 ? "walking" : "still",
    batteryPct: Math.round(level * 100),
    charging: state === Battery.BatteryState.CHARGING,
    permissionOk: pos !== null,
  });
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
