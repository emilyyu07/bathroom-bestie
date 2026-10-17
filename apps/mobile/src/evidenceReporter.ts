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
export function startEvidenceReporter(opts: {
  personId: string;
  contractId: string;
  everyMs?: number;
}) {
  const send = async () => {
    const perm = await Location.getForegroundPermissionsAsync();
    const [pos, level, state] = await Promise.all([
      perm.granted ? Location.getLastKnownPositionAsync() : null,
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    const speed = pos?.coords.speed ?? 0; // m/s
    await post("/evidence", {
      personId: opts.personId,
      contractId: opts.contractId,
      t: nowMinute(),
      area: { lat: round(pos?.coords.latitude ?? 0), lon: round(pos?.coords.longitude ?? 0) },
      motion: speed > 5 ? "vehicle" : speed > 0.5 ? "walking" : "still",
      batteryPct: Math.round(level * 100),
      charging: state === Battery.BatteryState.CHARGING,
      permissionOk: perm.granted,
    });
  };
  void send().catch(() => undefined);
  const h = setInterval(() => void send().catch(() => undefined), opts.everyMs ?? 5 * 60_000);
  return () => clearInterval(h);
}
