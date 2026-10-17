import { z } from "zod";

/** All times are integer minutes since the Unix epoch (or scenario-relative minutes in sims). */
export const Minute = z.number().int();
export type Minute = z.infer<typeof Minute>;

/** ~110 m at the equator. Invariant 5: round before storage. */
/**
 * How often a phone reports while a night is active (minutes). Part of the contract as
 * `thresholds.report_every_min` so the app, the simulator and the engine agree; this is only the
 * default. Presets are written in minutes of silence, which at 3 min/report is a whole number of
 * missed reports (cautious: 12 min = 4 reports).
 */
export const DEFAULT_REPORT_EVERY_MIN = 3;

export const COORD_DECIMALS = 3;
export const roundCoord = (n: number): number => {
  const f = 10 ** COORD_DECIMALS;
  return Math.round(n * f) / f;
};

export const Lat = z.number().min(-90).max(90);
export const Lon = z.number().min(-180).max(180);

/** Coordinates that are always rounded on parse. */
export const RoundedArea = z.object({
  lat: Lat.transform(roundCoord),
  lon: Lon.transform(roundCoord),
});
export type RoundedArea = z.infer<typeof RoundedArea>;

export const Circle = z.object({ center: RoundedArea, radius_m: z.number().positive() });
export type Circle = z.infer<typeof Circle>;

export const PersonId = z.string().min(1);

/** Great-circle distance in metres. */
export const distanceM = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
