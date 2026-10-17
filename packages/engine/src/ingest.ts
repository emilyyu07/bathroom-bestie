import { distanceM, type Contract, type EvidenceReport } from "@bathroombestie/schema";
import type { EngineState } from "./state";

/** Fold one evidence report into the derived per-person state (evidence itself stays append-only). */
export function ingest(contract: Contract, state: EngineState, e: EvidenceReport): void {
  const p = state.people[e.personId]!;
  p.lastReportAt = Math.max(p.lastReportAt ?? e.t, e.t);
  p.prevBattery = p.lastBattery;
  p.lastBattery = e.batteryPct;
  p.lastCharging = e.charging;
  if (!e.permissionOk) {
    p.permissionLost = true;
    return; // location/motion are not trustworthy without permission
  }
  p.permissionLost = false;
  const moved =
    e.motion !== "still" ||
    (p.lastArea !== null && (p.lastArea.lat !== e.area.lat || p.lastArea.lon !== e.area.lon));
  p.lastArea = e.area;
  if (distanceM(e.area, contract.corridor.center) <= contract.corridor.radius_m)
    p.lastCorridorAt = e.t;
  if (moved) p.lastMoveAt = e.t;
  if (e.homeArrived) p.home = true;
}
