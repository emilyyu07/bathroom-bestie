import { distanceM, type Contract, type EvidenceReport } from "@bathroombestie/schema";
import { applicable } from "./milestones";
import type { EngineState, PersonState } from "./state";

/** Reaching a place ends its nudge, even late. Rounded locations + the 200 m minimum radius make this reliable. */
const reachMilestones = (
  contract: Contract,
  p: PersonState,
  id: string,
  area: { lat: number; lon: number },
  t: number,
) => {
  for (const m of applicable(contract, id))
    if (
      m.kind === "area" &&
      p.milestoneMet[m.id] === undefined &&
      distanceM(area, m.within.center) <= m.within.radius_m
    )
      p.milestoneMet[m.id] = t;
};

/** Fold one evidence report into the derived per-person state (evidence itself stays append-only). */
export function ingest(contract: Contract, state: EngineState, e: EvidenceReport): void {
  const p = state.people[e.personId]!;
  if (p.lastReportAt === null) {
    // Her first report: monitoring starts here. The "left the area" and "stopped moving" clocks
    // start at this moment too, so someone whose phone joins late is not charged for the time
    // before it existed.
    p.lastCorridorAt = e.t;
    p.lastMoveAt = e.t;
  }
  // A report that arrives late and is older than one already seen (a retry, a buffered flush).
  // What happened still counts (she got home, she reached a place), but where she is NOW, her
  // battery and her motion stay with the newest report: an old fix must not move her back.
  if (p.lastReportAt !== null && e.t < p.lastReportAt) {
    if (e.homeArrived) p.home = true;
    else if (e.permissionOk && e.area) {
      if (distanceM(e.area, contract.corridor.center) <= contract.corridor.radius_m)
        p.lastCorridorAt = Math.max(p.lastCorridorAt, e.t);
      reachMilestones(contract, p, e.personId, e.area, e.t);
    }
    return;
  }
  p.lastReportAt = e.t;
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
  p.lastMotion = e.motion;
  const moved =
    e.motion !== "still" ||
    (p.lastArea !== null && (p.lastArea.lat !== area.lat || p.lastArea.lon !== area.lon));
  p.lastArea = area;
  if (distanceM(area, contract.corridor.center) <= contract.corridor.radius_m)
    p.lastCorridorAt = e.t;
  if (moved) p.lastMoveAt = e.t;
  reachMilestones(contract, p, e.personId, area, e.t);
}
