import { describe, expect, it } from "vitest";
import {
  makeContract,
  thresholdsFor,
  type Contract,
  type EvidenceReport,
  type PresetName,
} from "@bathroombestie/schema";
import { replay } from "../src";
import { ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };
const rungs = (a: { rung: number; t: number; kind: string }[]) =>
  a.map((x) => `${x.rung}@${x.t}:${x.kind}`);
const anaOnly = <T extends { personId: string }>(xs: T[]) => xs.filter((a) => a.personId === "ana");

const armed = (preset: PresetName = "standard", who = ["ana"]): Contract =>
  makeContract({
    preset,
    thresholds: thresholdsFor(preset),
    milestones: [{ id: "home", kind: "home", by: 330, who }],
    expires: 480,
  });

const arrival = (t: number): EvidenceReport => ({
  personId: "ana",
  contractId: "c1",
  t,
  motion: "still",
  batteryPct: 50,
  charging: false,
  permissionOk: true,
  homeArrived: true,
});

/**
 * bea and cy stay at A, reporting every 5 min to minute 300. ana reports from `ana(t)`
 * (null = no report). By default she is with the group until `leaveAt`, then away at FAR, walking.
 */
const night =
  (ana: (t: number) => Partial<EvidenceReport> | EvidenceReport | null) =>
  (t: number): EvidenceReport[] => {
    if (t % 5 !== 0 || t > 300) return [];
    const out = [ev("bea", t, { area: A }), ev("cy", t, { area: A })];
    const a = ana(t);
    if (a) out.push("personId" in a ? (a as EvidenceReport) : ev("ana", t, a));
    return out;
  };
const leavesAt = (leaveAt: number) => (t: number) => ({ area: t >= leaveAt ? FAR : A });

describe("exit-alone: she left the group alone and has not got home", () => {
  it("never arrives: nudge, then (standard 45 min) hard, rung 2 after the ack, then the whole ladder", () => {
    const { alerts, state } = run({
      contract: armed(),
      to: 170,
      evidence: night(leavesAt(100)),
    });
    const mine = anaOnly(alerts);
    expect(rungs(mine)).toEqual([
      "1@125:separation", // apart 25 min
      "2@151:exit_alone", // overdue after 145 (100 + 45), hard, then the 5-min ack
      "3@156:escalation",
      "3@161:escalation",
    ]);
    expect(mine[1]).toMatchObject({ to: ["bea"] }); // bea holds the 0-180 slot
    expect(mine[1]!.message).toBe("ana left the group 51 min ago and hasn't arrived home.");
    expect(mine[1]!.factors[0]).toBe("Left the group 51 min ago; not home yet");
    expect(mine[2]!.message).toBe(
      "Still no word that ana is home after 56 min, and bea hasn't responded. You're next.",
    );
    expect(mine[3]!.message).toBe(
      "Nobody has responded about ana, who left the group 61 min ago and hasn't arrived home.",
    );
    expect(state.people.ana!.exitAloneSince).toBe(100);
    expect(state.incidents.filter((i) => i.personId === "ana")).toHaveLength(1);
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      kind: "exit_alone",
      severity: "hard",
    });
  });

  it("the nudge she receives states a fact (no instruction)", () => {
    // exit-alone opens its own incident when no separation nudge is open: a separation_min longer
    // than exit_alone_min is not a real preset, so exercise the template directly through a hard open.
    const c = armed();
    c.thresholds = { ...c.thresholds, separation_min: 200 }; // keep the separation nudge out of the way
    const { alerts } = run({ contract: c, to: 160, evidence: night(leavesAt(100)) });
    const first = anaOnly(alerts)[0]!;
    expect(first).toMatchObject({ rung: 1, kind: "exit_alone", to: ["ana"] });
    expect(first.message).toBe(
      "You've been away from your group for 46 min and haven't arrived home.",
    );
  });

  it("arrives in time: only the quiet separation nudge, closed as 'home'", () => {
    const { alerts, state } = run({
      contract: armed(),
      to: 200,
      evidence: night((t) => (t < 135 ? leavesAt(100)(t) : t === 135 ? arrival(135) : null)),
    });
    expect(rungs(anaOnly(alerts))).toEqual(["1@125:separation"]);
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      status: "resolved",
      resolution: "home",
      resolvedAt: 135,
    });
    expect(state.people.ana!.exitAloneSince).toBeNull();
  });

  it("rejoining clears the clock; leaving again starts a fresh one", () => {
    const apart = (t: number) => (t >= 100 && t < 140) || t >= 200;
    const { state, alerts } = run({
      contract: armed(),
      to: 205,
      evidence: night((t) => ({ area: apart(t) ? FAR : A })),
    });
    expect(rungs(anaOnly(alerts))).toEqual(["1@125:separation"]); // rejoined at 140, before 146
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      resolution: "rejoined",
    });
    expect(state.people.ana!.exitAloneSince).toBe(200); // the new departure, not the old one
  });

  it("is not armed without a home milestone for her", () => {
    const none = makeContract(); // no milestones
    const { alerts, state } = run({ contract: none, to: 200, evidence: night(leavesAt(100)) });
    expect(rungs(anaOnly(alerts))).toEqual(["1@125:separation"]);
    expect(state.people.ana!.exitAloneSince).toBeNull();
  });

  it("is armed per person: a home milestone for bea does not arm ana", () => {
    const { alerts, state } = run({
      contract: armed("standard", ["bea"]),
      to: 200,
      evidence: night(leavesAt(100)),
    });
    expect(anaOnly(alerts).some((a) => a.kind === "exit_alone")).toBe(false);
    expect(state.people.ana!.exitAloneSince).toBeNull();
  });

  it("leaving with a friend is not leaving alone", () => {
    // ana and bea go to FAR together; cy stays. ana still has a fresh peer within 150 m.
    const feed = (t: number): EvidenceReport[] =>
      t % 5 !== 0 || t > 300
        ? []
        : [
            ev("cy", t, { area: A }),
            ev("bea", t, { area: t >= 100 ? FAR : A }),
            ev("ana", t, { area: t >= 100 ? FAR : A }),
          ];
    const { alerts, state } = run({ contract: armed(), to: 250, evidence: feed });
    expect(anaOnly(alerts)).toEqual([]);
    expect(state.people.ana!.exitAloneSince).toBeNull();
  });

  it("does not start for someone who was never with the group", () => {
    const { alerts, state } = run({
      contract: armed(),
      to: 200,
      evidence: night(() => ({ area: FAR })), // apart from the first report
    });
    expect(state.people.ana!.togetherAt).toBeNull();
    expect(state.people.ana!.exitAloneSince).toBeNull();
    expect(anaOnly(alerts).some((a) => a.kind === "exit_alone")).toBe(false);
  });

  it("does not start when she is apart but not moving (the group left her, or a stuck fix)", () => {
    const { state, alerts } = run({
      contract: armed(),
      to: 150,
      evidence: night((t) => ({
        area: t >= 100 ? FAR : A,
        motion: t >= 100 ? "still" : "walking",
      })),
    });
    expect(state.people.ana!.exitAloneSince).toBeNull();
    expect(anaOnly(alerts).some((a) => a.kind === "exit_alone")).toBe(false);
  });

  it("freezes while her phone is quiet, so the departure time is kept", () => {
    const { state } = run({
      contract: armed(),
      to: 130,
      evidence: night((t) => (t <= 110 ? leavesAt(100)(t) : null)),
    });
    expect(state.people.ana!.exitAloneSince).toBe(100);
  });

  it("is quicker at a more cautious preset", () => {
    const friendAlertAt = (preset: PresetName) =>
      anaOnly(
        run({ contract: armed(preset), to: 200, evidence: night(leavesAt(100)) }).alerts,
      ).find((a) => a.rung >= 2)!.t;
    // overdue after 100 + exit_alone_min (60 / 45 / 30), then the ack timeout (7 / 5 / 3)
    expect([
      friendAlertAt("relaxed"),
      friendAlertAt("standard"),
      friendAlertAt("cautious"),
    ]).toEqual([168, 151, 134]);
  });

  it("is derived state: replaying the logs reproduces the live fold, alerts included", () => {
    const f = night(leavesAt(100));
    const live = run({ contract: armed(), to: 170, evidence: f });
    const evidence: EvidenceReport[] = [];
    for (let t = 0; t <= 170; t++) evidence.push(...f(t));
    const r = replay({ contract: armed(), evidence, actions: [], to: 170 });
    expect(JSON.stringify(r)).toEqual(JSON.stringify({ state: live.state, alerts: live.alerts }));
  });
});
