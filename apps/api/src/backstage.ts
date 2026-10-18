import type { Alert, Contract } from "@bathroombestie/schema";
import { separatedFor, silentMinutes, watcherFor, type EngineState } from "@bathroombestie/engine";
import type { EmergencyContact, EmergencyNotice } from "./emergency";

/**
 * What a presenter (or a developer) needs to follow a night: who is reporting, who is quiet, which
 * incidents are open and how far up the ladder they are, and who was told what. It is built from
 * the engine's derived state and the stored alerts, and deliberately carries NO location of any
 * kind (no area, no last-known place): the product never shares anyone's position live.
 */
export type MemberView = "not_reporting" | "reporting" | "quiet" | "permission_off" | "home";

export interface Backstage {
  contractId: string;
  status: "draft" | "active";
  now: number;
  demo: boolean;
  owner: string;
  members: {
    id: string;
    role: "planner" | "friend";
    /** Friends only: whether they joined (accepted the watch). */
    joined: boolean | null;
    view: MemberView;
    minutesSinceReport: number | null;
    battery: number | null;
    apartMin: number;
    leftAloneMin: number | null;
    /** Their turn to watch the planner right now. */
    watchingNow: boolean;
  }[];
  incidents: {
    id: string;
    personId: string;
    kind: string;
    severity: string;
    rung: number;
    step: string;
    status: string;
    resolution: string | null;
    confirmedBy: string | null;
    raisedBy: string | null;
    openedAt: number;
    minutesOpen: number;
  }[];
  alerts: { t: number; rung: number; kind: string; about: string; to: string[]; message: string }[];
  /** Her emergency contact and the message BathroomBestie would send them (demo only, never sent). */
  emergency: { contact: EmergencyContact | null; notice: EmergencyNotice | null };
}

export function backstageOf(
  contract: Contract,
  status: "draft" | "active",
  state: EngineState,
  alerts: Alert[],
  joined: string[],
  now: number,
  emergency: Backstage["emergency"] = { contact: null, notice: null },
): Backstage {
  const [owner, ...friends] = contract.group.members;
  const watcher = watcherFor(contract, owner!, now);
  return {
    contractId: contract.id,
    status,
    now,
    demo: contract.demo === true,
    owner: owner!,
    members: contract.group.members.map((id) => {
      const p = state.people[id]!;
      const silent = p.lastReportAt === null ? null : silentMinutes(contract, state, id, now);
      const view: MemberView = p.home
        ? "home"
        : p.lastReportAt === null
          ? "not_reporting"
          : p.permissionLost
            ? "permission_off"
            : silent! >= contract.thresholds.silence_min
              ? "quiet"
              : "reporting";
      return {
        id,
        role: id === owner ? "planner" : "friend",
        joined: friends.includes(id) ? joined.includes(id) : null,
        view,
        minutesSinceReport: silent,
        battery: p.lastBattery === null ? null : Math.round(p.lastBattery),
        apartMin: separatedFor(contract, state, id, now),
        leftAloneMin: p.exitAloneSince === null ? null : now - p.exitAloneSince,
        watchingNow: id === watcher,
      };
    }),
    incidents: state.incidents.map((i) => ({
      id: i.id,
      personId: i.personId,
      kind: i.kind,
      severity: i.severity,
      rung: i.rung,
      step: i.step,
      status: i.status,
      resolution: i.resolution ?? null,
      confirmedBy: i.confirmedBy ?? null,
      raisedBy: i.raisedBy ?? null,
      openedAt: i.openedAt,
      minutesOpen: (i.resolvedAt ?? now) - i.openedAt,
    })),
    // Alerts name who they are about and who got them; the location they carry is left out.
    alerts: alerts
      .slice()
      .sort((a, b) => a.t - b.t)
      .map((a) => ({
        t: a.t,
        rung: a.rung,
        kind: a.kind,
        about: a.personId,
        to: a.to,
        message: a.message,
      })),
    emergency,
  };
}
