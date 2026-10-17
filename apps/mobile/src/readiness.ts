import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { get } from "./api";
import { sendEvidenceOnce } from "./evidenceReporter";
import { HOME_GEOFENCE_TASK } from "./tasks";

/** Mirrors ReadinessSnapshot in packages/schema (the mobile app is outside the workspace). */
export interface Snapshot {
  permissions: { backgroundLocation: boolean; notifications: boolean };
  battery: { level: number; restricted: boolean; lowPowerMode: boolean };
  connectivityRttMs: number | null;
  firstEvidenceAfterS: number | null;
  watchers: { id: string; accepted: boolean; reachable: boolean }[];
  homeGeofenceSet: boolean;
  contractConfirmed: boolean;
}

/** Platform checks that don't exist everywhere (web, older Android) count as "not set". */
const orFalse = (p: Promise<boolean>) => p.catch(() => false);

async function roundTripMs(): Promise<number | null> {
  const t0 = Date.now();
  try {
    await get<{ ok: boolean }>("/health");
    return Date.now() - t0;
  } catch {
    return null;
  }
}

/**
 * Seconds until one real evidence report *with a location* reaches the server; null otherwise.
 * A report without location permission proves the network, not that updates will work.
 */
async function firstEvidenceS(me: string, contractId: string): Promise<number | null> {
  const t0 = Date.now();
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return null;
    return (await sendEvidenceOnce(me, contractId)) ? Math.round((Date.now() - t0) / 1000) : null;
  } catch {
    return null;
  }
}

/** Reads this device's real state for pre-flight. Asks for nothing; see requestPermissions. */
export async function collectSnapshot(opts: {
  contractId: string;
  me: string;
  contractConfirmed: boolean;
}): Promise<Snapshot> {
  const [bg, notif, level, optimized, lowPower, rtt, evidence, watchers, geofence] =
    await Promise.all([
      Location.getBackgroundPermissionsAsync().catch(() => ({ granted: false })),
      Notifications.getPermissionsAsync().catch(() => ({ granted: false })),
      Battery.getBatteryLevelAsync().catch(() => -1),
      orFalse(Battery.isBatteryOptimizationEnabledAsync()),
      orFalse(Battery.isLowPowerModeEnabledAsync()),
      roundTripMs(),
      firstEvidenceS(opts.me, opts.contractId),
      get<{ watchers: Snapshot["watchers"] }>(`/contracts/${opts.contractId}/watchers`)
        .then((r) => r.watchers)
        .catch(() => []),
      orFalse(Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK)),
    ]);
  return {
    permissions: { backgroundLocation: bg.granted, notifications: notif.granted },
    // Unknown level (-1, e.g. web) reports 0 so the low-battery warning shows rather than hides.
    battery: {
      level: Math.max(0, Math.round(level * 100)),
      restricted: optimized,
      lowPowerMode: lowPower,
    },
    connectivityRttMs: rtt,
    firstEvidenceAfterS: evidence,
    watchers,
    homeGeofenceSet: geofence,
    contractConfirmed: opts.contractConfirmed,
  };
}

/** Asks for what pre-flight needs. Background location must follow foreground on Android. */
export async function requestPermissions(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => ({ granted: false }));
  if (fg.granted) await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
  await Notifications.requestPermissionsAsync().catch(() => undefined);
}
