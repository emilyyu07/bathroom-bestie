import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport, type Milestone } from "@bathroombestie/schema";
import { replay } from "../src";
import { ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };
const rungs = (a: { rung: number; t: number; kind: string }[]) =>
  a.map((x) => `${x.rung}@${x.t}:${x.kind}`);

const home = (by: number, who?: string[]): Milestone => ({ id: "home", kind: "home", by, who });
const contractWith = (milestones: Milestone[]) => makeContract({ milestones, expires: 480 });

/**
 * bea and cy report from `area(t)` every 5 min to minute 300. `ana(t)` supplies ana's reports
 * (default: with the group until `anaUntil`, then nothing).
 */
const night =
  (opts: {
    ana?: (t: number) => Partial<EvidenceReport> | null;
    area?: (t: number) => { lat: number; lon: number };
  }) =>
  (t: number): EvidenceReport[] => {
    if (t % 5 !== 0 || t > 300) return [];
    const area = opts.area?.(t) ?? A;
    const out = [ev("bea", t, { area }), ev("cy", t, { area })];
    const a = opts.ana ? opts.ana(t) : { area };
    if (a) out.push(ev("ana", t, { area, ...a }));
    return out;
  };

const anaAlerts = <T extends { personId: string }>(xs: T[]) =>
  xs.filter((a) => a.personId === "ana");

describe("home milestone", () => {
  const c = contractWith([home(240, ["ana"])]);

  it("arriving home on time raises nothing", () => {
    const { alerts, state } = run({
      contract: c,
      to: 300,
      evidence: night({ ana: (t) => (t < 230 ? {} : t === 230 ? { homeArrived: true } : null) }),
    });
    expect(alerts).toEqual([]);
    expect(state.people.ana!.home).toBe(true);
  });

  it("late but still reporting: a rung-1 advisory nudge after the grace, never anything louder", () => {
    const { alerts, state } = run({
      contract: c,
      to: 310,
      evidence: night({ ana: (t) => ({ homeArrived: t === 300 }) }),
    });
    const mine = anaAlerts(alerts);
    // standard grace is 10 min: overdue strictly after minute 250, so the first nudge is at 251
    expect(rungs(mine)).toEqual(["1@251:missed_milestone"]);
    expect(mine[0]).toMatchObject({ to: ["ana"] });
    expect(mine[0]!.message).toBe("You're 11 min past the time you planned to be home.");
    expect(mine[0]!.factors[0]).toBe("11 min past a planned arrival time");
    // arriving home ends it
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      severity: "advisory",
      status: "resolved",
      resolution: "home",
      resolvedAt: 300,
    });
  });

  it("late AND quiet climbs the ladder: the same incident upgrades to hard and the ack timer restarts", () => {
    // Last report at 235, together with the group, so 'unexplained stop' does not apply.
    const { alerts, state } = run({
      contract: c,
      to: 280,
      evidence: night({ ana: (t) => (t <= 235 ? {} : null) }),
    });
    expect(rungs(anaAlerts(alerts))).toEqual([
      "1@251:missed_milestone", // overdue, still reachable: advisory
      "2@260:missed_milestone", // quiet since 255 (silence_min 20) => hard; 5 min ack => rung 2
      "3@265:escalation",
      "3@270:escalation",
    ]);
    const rung2 = anaAlerts(alerts)[1]!;
    expect(rung2.to).toEqual(["cy"]); // cy holds the 180-360 watch slot
    expect(rung2.message).toBe(
      "ana is 20 min past a planned arrival time, with no update for 25 min.",
    );
    expect(state.incidents.filter((i) => i.personId === "ana")).toHaveLength(1);
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      kind: "missed_milestone",
      severity: "hard",
    });
  });

  it("a dying battery is a benign explanation: nothing ever reaches a friend", () => {
    const { alerts, state } = run({
      contract: c,
      to: 300,
      evidence: night({ ana: (t) => (t <= 235 ? { batteryPct: t === 235 ? 3 : 8 } : null) }),
    });
    // She is still 'reachable' (silent 16 min < silence_min) when the deadline passes, so she gets
    // the quiet nudge at 251. Once silent for silence_min (255) battery death suppresses escalation.
    expect(rungs(anaAlerts(alerts))).toEqual(["1@251:missed_milestone"]);
    expect(anaAlerts(alerts).every((a) => a.to.length === 1 && a.to[0] === "ana")).toBe(true);
    expect(state.incidents.find((i) => i.personId === "ana")).toMatchObject({
      severity: "advisory",
      status: "open",
    });
    expect(state.notes.some((n) => n.personId === "ana")).toBe(true);
  });

  it("a milestone with a `who` binds only those people", () => {
    const { alerts } = run({
      contract: contractWith([home(240, ["bea"])]),
      to: 300,
      evidence: night({}), // nobody ever gets home
    });
    expect(anaAlerts(alerts)).toEqual([]);
    expect(rungs(alerts.filter((a) => a.personId === "bea"))).toEqual(["1@251:missed_milestone"]);
  });

  it("with `who` omitted it binds every member", () => {
    const { alerts } = run({ contract: contractWith([home(240)]), to: 255, evidence: night({}) });
    expect(
      alerts
        .filter((a) => a.kind === "missed_milestone")
        .map((a) => a.personId)
        .sort(),
    ).toEqual(["ana", "bea", "cy"]);
  });

  it("is derived state: replaying the logs reproduces the live fold, alerts included", () => {
    const f = night({ ana: (t) => (t <= 235 ? {} : null) });
    const live = run({ contract: c, to: 280, evidence: f });
    const evidence: EvidenceReport[] = [];
    for (let t = 0; t <= 280; t++) evidence.push(...f(t));
    const r = replay({ contract: c, evidence, actions: [], to: 280 });
    expect(JSON.stringify(r)).toEqual(JSON.stringify({ state: live.state, alerts: live.alerts }));
  });
});

describe("area milestone", () => {
  const spot = { center: A, radius_m: 300 };
  const area = (by: number): Milestone => ({
    id: "bar",
    kind: "area",
    by,
    within: spot,
    who: ["ana"],
  });
  // everyone starts away at FAR and moves to the milestone area (A) together at `arrive`
  const together = (arrive: number) => night({ area: (t) => (t < arrive ? FAR : A) });

  it("reached on time: nothing", () => {
    const { alerts } = run({
      contract: contractWith([area(100)]),
      to: 200,
      evidence: together(90),
    });
    expect(alerts).toEqual([]);
  });

  it("reached late: a nudge after the grace, closed as 'arrived' with no cooldown", () => {
    const { alerts, state } = run({
      contract: contractWith([area(100)]),
      to: 200,
      evidence: together(130),
    });
    expect(rungs(alerts)).toEqual(["1@111:missed_milestone"]);
    expect(alerts[0]!.message).toBe("You're 11 min past a time you planned to arrive somewhere.");
    const inc = state.incidents[0]!;
    expect(inc).toMatchObject({ status: "resolved", resolution: "arrived", resolvedAt: 130 });
    expect(state.people.ana!.cooldownUntil).toBeNull();
    expect(state.people.ana!.milestoneMet.bar).toBe(130);
  });

  it("never reached while apart from nothing: nudge only, it does not escalate by itself", () => {
    const { alerts } = run({
      contract: contractWith([area(100)]),
      to: 300,
      evidence: together(10_000),
    });
    expect(rungs(alerts)).toEqual(["1@111:missed_milestone"]);
  });
});

describe("two nudges about her", () => {
  it("the separation nudge keeps the floor; the late-nudge opens right after she rejoins (no cooldown)", () => {
    const c = contractWith([home(240, ["ana"])]);
    const { alerts } = run({
      contract: c,
      to: 300,
      evidence: (t) => {
        if (t % 5 !== 0 || t > 300) return [];
        const apart = t >= 20 && t < 270;
        return [
          ev("bea", t, { area: A }),
          ev("cy", t, { area: A }),
          ev("ana", t, { area: apart ? FAR : A }),
        ];
      },
    });
    expect(rungs(anaAlerts(alerts))).toEqual([
      "1@45:separation", // apart since 20, 25 min on standard
      "1@271:missed_milestone", // she rejoined at 270; still overdue; opens the next tick
    ]);
  });
});
