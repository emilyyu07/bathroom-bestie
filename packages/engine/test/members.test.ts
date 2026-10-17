import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport, type FriendAction } from "@bathroombestie/schema";
import { replay } from "../src";
import { ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };
const rungs = (a: { rung: number; t: number; kind: string }[]) =>
  a.map((x) => `${x.rung}@${x.t}:${x.kind}`);
const about = <T extends { personId: string }>(xs: T[], who: string) =>
  xs.filter((a) => a.personId === who);

describe("a member is monitored from their first report", () => {
  it("raises nothing about friends who never report (one phone, a whole night)", () => {
    // Only ana's phone reports; bea and cy are in the group but have not joined.
    const { alerts } = run({
      to: 250,
      evidence: (t) => (t % 3 === 0 ? [ev("ana", t, { area: A })] : []),
    });
    expect(alerts).toEqual([]);
  });

  it("the engine can say nothing about her when nobody else reports (documented limit, not an alert)", () => {
    // She walks away and never gets home, but with no peers there is nothing to be apart from.
    const c = makeContract({
      milestones: [{ id: "home", kind: "home", by: 330, who: ["ana"] }],
      expires: 480,
    });
    const { alerts } = run({
      contract: c,
      to: 250,
      evidence: (t) => (t % 3 === 0 ? [ev("ana", t, { area: t >= 99 ? FAR : A })] : []),
    });
    expect(alerts).toEqual([]); // no false alarms about the friends, and no exit-alone without peers
  });

  it("monitoring starts at the first report: a friend who then goes quiet is noticed", () => {
    // bea reports once at 30 and never again.
    const { alerts } = run({
      to: 120,
      evidence: (t) => [...(t === 30 ? [ev("bea", t, { area: A })] : [])],
    });
    // quiet from 30; the score path fires once confidence has been low long enough
    expect(rungs(about(alerts, "bea"))[0]).toMatch(/^1@\d+:low_confidence$/);
    expect(about(alerts, "bea")[0]!.t).toBeGreaterThan(30);
    expect(about(alerts, "cy")).toEqual([]); // never reported: still nothing
  });

  it("does not charge a late-joining phone for the time before it existed", () => {
    // First report at minute 100, far outside the 2 km corridor. Without the first-report rule the
    // corridor clock would have run since minute 0 and fired immediately.
    const outside = { lat: 43.7, lon: -79.38 }; // ~5.5 km north
    const { alerts, state } = run({
      to: 128,
      evidence: (t) => (t >= 100 && t % 3 === 1 ? [ev("ana", t, { area: outside })] : []),
    });
    expect(state.people.ana!.lastCorridorAt).toBe(100);
    expect(about(alerts, "ana")).toEqual([]);
  });

  it("a friend's worry about someone who never reported is a human report and still climbs", () => {
    // cy is bea's watcher (a watcher's worry goes straight to rung 4), so ana raises it.
    const worry: FriendAction = { type: "worry", by: "ana", targetPersonId: "bea", t: 40 };
    const { alerts } = run({ to: 60, evidence: () => [], actions: [worry] });
    expect(rungs(about(alerts, "bea"))).toEqual([
      "2@40:friend_worry",
      "3@45:escalation",
      "3@50:escalation",
    ]);
    // and nothing else is raised automatically about anyone
    expect(alerts.every((a) => a.personId === "bea")).toBe(true);
  });

  it("arrival counts as a report: someone whose first report is an arrival is monitored and home", () => {
    const arrival: EvidenceReport = {
      personId: "ana",
      contractId: "c1",
      t: 10,
      motion: "still",
      batteryPct: 50,
      charging: false,
      permissionOk: true,
      homeArrived: true,
    };
    const { state } = run({ to: 40, evidence: (t) => (t === 10 ? [arrival] : []) });
    expect(state.people.ana!.home).toBe(true);
    expect(state.people.ana!.lastReportAt).toBe(10);
  });

  it("is derived state: replaying the logs reproduces the live fold", () => {
    const f = (t: number) => (t % 3 === 0 && t <= 90 ? [ev("ana", t, { area: A })] : []);
    const live = run({ to: 120, evidence: f });
    const evidence: EvidenceReport[] = [];
    for (let t = 0; t <= 120; t++) evidence.push(...f(t));
    const r = replay({ contract: makeContract(), evidence, actions: [], to: 120 });
    expect(JSON.stringify(r)).toEqual(JSON.stringify({ state: live.state, alerts: live.alerts }));
  });
});
