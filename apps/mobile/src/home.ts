import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { nowMinute } from "./api";
import { readNight, stopBackgroundReporting } from "./background";
import { reportArrivedHome } from "./evidenceReporter";
import { HOME_GEOFENCE_TASK } from "./tasks";

/**
 * Her home, as a geofence on this phone. Invariant 5: the coordinates are stored here and never
 * sent; the server only ever learns `homeArrived: true`.
 */
const HOME_KEY = "bathroombestie.home";
const HOME_RADIUS_M = 150;

// Defined at module load (index.ts imports this file) so Android can run it after a restart.
TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(
  HOME_GEOFENCE_TASK,
  async ({ data, error }) => {
    if (error || data?.eventType !== Location.GeofencingEventType.Enter) return;
    const night = await readNight();
    if (!night || nowMinute() > night.until) return; // arriving home outside a night: nothing to do
    if (await reportArrivedHome(night.personId, night.contractId).catch(() => false))
      // The engine treats her as home for the rest of the night, so stop reporting: an ordinary
      // report from home would reveal where home is.
      await stopBackgroundReporting();
  },
);

/** Where she's ending up tonight: home, or a friend's place. Only ever stored on this phone. */
export interface SafePlace {
  label: string;
}

async function fence(latitude: number, longitude: number, label: string): Promise<void> {
  await AsyncStorage.setItem(HOME_KEY, JSON.stringify({ latitude, longitude, label }));
  await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [
    {
      identifier: "home",
      latitude,
      longitude,
      radius: HOME_RADIUS_M,
      notifyOnEnter: true,
      notifyOnExit: false,
    },
  ]);
}

/** Saves where she is now as her safe place (on this phone only) and starts the geofence. */
export async function setHomeHere(label = "Home"): Promise<void> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 30_000));
  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    timeout,
  ]);
  if (!pos) throw new Error("No location fix yet. Try again in a moment.");
  await fence(pos.coords.latitude, pos.coords.longitude, label);
}

/**
 * Saves a typed address as her safe place. The phone's own geocoder turns it into a point; the
 * address and the point stay on this phone and are never sent to BathroomBestie (invariant 5).
 */
export async function setHomeAtAddress(address: string, label = "Home"): Promise<void> {
  const found = await Location.geocodeAsync(address.trim()).catch(() => []);
  const first = found[0];
  if (!first) throw new Error("Couldn't find that address. Try adding the city.");
  await fence(first.latitude, first.longitude, label);
}

/** Her saved safe place's name, if a geofence is running. */
export async function safePlace(): Promise<SafePlace | null> {
  if (!(await homeIsSet())) return null;
  const raw = await AsyncStorage.getItem(HOME_KEY).catch(() => null);
  const label = raw ? (JSON.parse(raw) as { label?: string }).label : undefined;
  return { label: label || "Home" };
}

export async function clearHome(): Promise<void> {
  await AsyncStorage.removeItem(HOME_KEY);
  if (await Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK).catch(() => false))
    await Location.stopGeofencingAsync(HOME_GEOFENCE_TASK);
}

export const homeIsSet = () =>
  Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK).catch(() => false);
