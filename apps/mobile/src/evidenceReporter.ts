import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { nowMinute, post } from "./api";

const round = (n: number) => Math.round(n * 1000) / 1000; // ~100 m, before it ever leaves the phone

/**
 * Battery as a whole percent the API accepts (0-100). An unknown level (-1: the iOS Simulator, web)
 * reports 100, never 0: 0 would read as a dying battery and change how the engine treats her
 * silence, so unknown must not look like low.
 */
export const batteryPercent = (level: number): number =>
  level < 0 ? 100 : Math.min(100, Math.round(level * 100));

/**
 * Coarse location, battery and motion reports. On Android the night is reported from a
 * foreground service (background.ts); the timer below is the fallback where that can't run (web).
 *
 * Home is a geofence on the phone (home.ts); the server only ever receives `homeArrived: true`.
 * Android kills the app when location permission is revoked, so the next report (on reopen) is the
 * first chance to send permissionOk:false.
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
  const speed = pos ? await speedOf(pos) : 0; // m/s
  await post("/evidence", {
    personId,
    contractId,
    t: nowMinute(),
    area: { lat: round(pos?.coords.latitude ?? 0), lon: round(pos?.coords.longitude ?? 0) },
    motion: speed > 5 ? "vehicle" : speed > 0.5 ? "walking" : "still",
    batteryPct: batteryPercent(level),
    charging: state === Battery.BatteryState.CHARGING,
    permissionOk: pos !== null,
  });
}

/** The previous fix, kept on this phone only, to estimate speed when Android doesn't report one. */
const PREV_FIX_KEY = "bathroombestie.prevFix";
interface Fix {
  lat: number;
  lon: number;
  at: number; // ms
  /** Android's accuracy radius for this fix, in metres. */
  acc: number;
}

const metres = (a: Fix, b: Fix) => {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
};

/**
 * Speed in m/s. Balanced (Wi-Fi/cell) fixes usually carry no speed, which would make every report
 * "still" and stop the engine's exit-alone clock from ever starting; so when Android gives none,
 * use the distance from the previous fix, beyond both fixes' accuracy. A gap over 15 min says
 * nothing about motion now. A position jump (e.g. a stale fix replaced by a fresh one) can still
 * read as movement.
 */
export async function speedOf(pos: Location.LocationObject): Promise<number> {
  const now: Fix = {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    at: pos.timestamp,
    acc: pos.coords.accuracy ?? 50,
  };
  const raw = await AsyncStorage.getItem(PREV_FIX_KEY).catch(() => null);
  await AsyncStorage.setItem(PREV_FIX_KEY, JSON.stringify(now)).catch(() => undefined);
  const reported = pos.coords.speed ?? 0;
  if (reported > 0) return reported;
  const prev = raw ? (JSON.parse(raw) as Fix) : null;
  const dt = prev ? (now.at - prev.at) / 1000 : 0;
  if (!prev || dt <= 0 || dt > 15 * 60) return 0;
  // Count only movement beyond both fixes' uncertainty, so a phone sitting still (whose fixes
  // wander by their accuracy) reads as still rather than walking.
  return Math.max(0, metres(prev, now) - prev.acc - now.acc) / dt;
}

/**
 * The arrival event: homeArrived with no area at all. An arrival is an event, not a place
 * (invariant 5); the API would drop an area anyway (#13).
 */
export async function reportArrivedHome(personId: string, contractId: string): Promise<boolean> {
  const [level, state] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
  ]);
  await post("/evidence", {
    personId,
    contractId,
    t: nowMinute(),
    motion: "still",
    batteryPct: batteryPercent(level),
    charging: state === Battery.BatteryState.CHARGING,
    permissionOk: true,
    homeArrived: true,
  });
  return true;
}

/**
 * A recent cached position, else a fresh fix (bounded so a stuck GPS can't hang the caller).
 * The cache can be hours old (it is whatever Android last saw); a report is stamped "now", so an
 * old position would put her somewhere she left long ago.
 */
async function currentPosition(): Promise<Location.LocationObject | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 });
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
