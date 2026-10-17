import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { nowMinute } from "./api";
import { reportPosition } from "./evidenceReporter";
import { REPORTER_TASK } from "./tasks";

/**
 * Balanced (Wi-Fi/cell) by default: reports are rounded to ~100 m anyway, and a full night of GPS
 * fixes costs battery. The Android emulator has no Wi-Fi/cell location, only simulated GPS, so
 * set EXPO_PUBLIC_REPORT_ACCURACY=high there or background updates never arrive.
 */
const REPORT_ACCURACY =
  process.env.EXPO_PUBLIC_REPORT_ACCURACY === "high"
    ? Location.Accuracy.High
    : Location.Accuracy.Balanced;

/**
 * The night being reported. Stored, not held in memory: Android may run the task after it has
 * restarted the app process, when React state is gone.
 */
export interface Night {
  contractId: string;
  personId: string;
  /** Contract `expires` (epoch minutes); the service stops itself after this. */
  until: number;
  /** Contract `thresholds.report_every_min`: the reporting cadence is contract data. */
  everyMin: number;
}
const NIGHT_KEY = "bathroombestie.night";
let lastSentMs = 0;

export const readNight = async (): Promise<Night | null> => {
  const raw = await AsyncStorage.getItem(NIGHT_KEY);
  return raw ? (JSON.parse(raw) as Night) : null;
};

// Defined at module load (index.ts imports this file first) so the task exists whenever Android
// starts the app for it.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  REPORTER_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    const night = await readNight();
    if (!night || nowMinute() > night.until) return stopBackgroundReporting();
    const pos = data.locations[data.locations.length - 1];
    // Android can deliver bursts; one report per interval is enough.
    if (!pos || Date.now() - lastSentMs < (night.everyMin * 60_000) / 2) return;
    lastSentMs = Date.now();
    await reportPosition(night.personId, night.contractId, pos).catch(() => undefined);
  },
);

/** Starts the foreground service (persistent notification) for this night. */
export async function startBackgroundReporting(night: Night): Promise<void> {
  await AsyncStorage.setItem(NIGHT_KEY, JSON.stringify(night));
  // Always (re)start: after a force-stop Expo still reports the task as started and restores it
  // without the foreground service, which is what keeps it alive in the background.
  await Location.startLocationUpdatesAsync(REPORTER_TASK, {
    accuracy: REPORT_ACCURACY,
    timeInterval: night.everyMin * 60_000,
    distanceInterval: 0, // report on time even when she's not moving
    foregroundService: {
      notificationTitle: "BathroomBestie is on for tonight",
      notificationBody: "Sending your rough area to your watchers until the night ends.",
      killServiceOnDestroy: false, // keep reporting if she swipes the app away
    },
  });
}

export async function stopBackgroundReporting(): Promise<void> {
  await AsyncStorage.removeItem(NIGHT_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(REPORTER_TASK).catch(() => false))
    await Location.stopLocationUpdatesAsync(REPORTER_TASK);
}
