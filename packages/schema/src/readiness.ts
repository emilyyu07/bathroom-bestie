import { z } from "zod";
import { PersonId } from "./common";

export const ReadinessSnapshot = z.object({
  permissions: z.object({ backgroundLocation: z.boolean(), notifications: z.boolean() }),
  battery: z.object({
    level: z.number().min(0).max(100),
    restricted: z.boolean(),
    lowPowerMode: z.boolean(),
  }),
  /** Round-trip to the API in ms; null if unreachable. */
  connectivityRttMs: z.number().nonnegative().nullable(),
  /** Seconds from test start to first live evidence; null if none arrived. */
  firstEvidenceAfterS: z.number().nonnegative().nullable(),
  watchers: z.array(z.object({ id: PersonId, accepted: z.boolean(), reachable: z.boolean() })),
  homeGeofenceSet: z.boolean(),
  contractConfirmed: z.boolean(),
});
export type ReadinessSnapshot = z.infer<typeof ReadinessSnapshot>;

export const CheckResult = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(["blocking", "warning"]),
  status: z.enum(["pass", "fail"]),
  detail: z.string(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const ReadinessState = z.enum(["ready", "ready_with_warnings", "not_ready"]);
export type ReadinessState = z.infer<typeof ReadinessState>;

export const ReadinessReport = z.object({ state: ReadinessState, checks: z.array(CheckResult) });
export type ReadinessReport = z.infer<typeof ReadinessReport>;
