import { distanceM, type Contract, type EvidenceReport } from "@bathroombestie/schema";
import { applicable } from "./milestones";
import type { EngineState } from "./state";

/** Fold one evidence report into the derived per-person state (evidence itself stays append-only). */
export function ingest(contract: Contract, state: EngineState, e: EvidenceReport): void {
  const p = state.people[e.personId]!;
  p.lastReportAt = Math.max(p.lastReportAt ?? e.t, e.t);
  p.prevBattery = p.lastBattery;
  p.lastBattery = e.batteryPct;
  p.lastCharging = e.charging;
  // An arrival is an event, not a place (invariant 5): she is home, and any area that came with it
  // never feeds location logic.
  if (e.homeArrived) {
    p.home = true;
    return;
  }
  if (p.home) return; // she is home: the night is over for her, so later reports move nothing
  if (!e.permissionOk) {
    p.permissionLost = true;
    return; // location/motion are not trustworthy without permission
  }
  p.permissionLost = false;
  const area = e.area;
  if (!area) return; // unreachable through the schema: only an arrival may omit it
  const moved =
    e.motion !== "still" ||
    (p.lastArea !== null && (p.lastArea.lat !== area.lat || p.lastArea.lon !== area.lon));
  p.lastArea = area;
  if (distanceM(area, contract.corridor.center) <= contract.corridor.radius_m)
    p.lastCorridorAt = e.t;
  if (moved) p.lastMoveAt = e.t;
  for (const m of applicable(contract, e.personId)) {
    // Reaching it late still counts: it ends the nudge. Rounded locations + the 200 m minimum radius make this reliable.
    if (
      m.kind === "area" &&
      p.milestoneMet[m.id] === undefined &&
      distanceM(area, m.within.center) <= m.within.radius_m
    )
      p.milestoneMet[m.id] = e.t;
  }
}
