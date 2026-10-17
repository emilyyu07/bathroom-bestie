import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport } from "@bathroombestie/schema";
import { initialState, isApart, separatedFor } from "../src";
import { darkAna, ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };
const rungs = (a: { rung: number; t: number }[]) => a.map((x) => `${x.rung}@${x.t}`);

/** bea and cy stay at A and report every 5 min; ana's reports come from `ana(t)`. */
const withAna = (ana: (t: number) => EvidenceReport[]) => (t: number) => [
  ...(t % 5 === 0 ? [ev("bea", t, { area: A }), ev("cy", t, { area: A })] : []),
  ...ana(t),
];

describe("group cohesion", () => {
  it("separated = apart from every peer for separation_min: nudges her at rung 1 (standard: 25 min)", () => {
    const { alerts } = run({ to: 200, evidence: darkAna(1000, 61, 0) });
    expect(alerts).toHaveLength(1); // alone it never climbs
    expect(alerts[0]).toMatchObject({ rung: 1, kind: "separation", personId: "ana", to: ["ana"] });
    expect(alerts[0]!.t).toBe(25);
    expect(alerts[0]!.message).toContain("25 min");
    expect(alerts[0]!.factors).toContain("Apart from the group for 25 min");
  });

  it("scales with the preset's separation_min", () => {
    const first = (preset: "relaxed" | "standard" | "cautious") => {
      const base = makeContract();
      const mins = { relaxed: 40, standard: 25, cautious: 15 }[preset];
      const c = makeContract({ thresholds: { ...base.thresholds, separation_min: mins } });
      return run({ contract: c, to: 100, evidence: darkAna(1000, 61, 0) }).alerts[0]!.t;
    };
    expect([first("relaxed"), first("standard"), first("cautious")]).toEqual([40, 25, 15]);
  });

  it("a member who rejoins before separation_min is never flagged", () => {
    const { alerts, state } = run({
      to: 200,
      evidence: withAna((t) =>
        t % 5 === 0 ? [ev("ana", t, { area: t >= 5 && t <= 20 ? FAR : A })] : [],
      ),
    });
    expect(alerts).toEqual([]);
    expect(state.people.ana!.apartSince).toBeNull();
  });

  it("rejoining closes the nudge as 'rejoined'", () => {
    const { state, alerts } = run({
      to: 120,
      evidence: withAna((t) =>
        t % 5 === 0 ? [ev("ana", t, { area: t >= 5 && t < 60 ? FAR : A })] : [],
      ),
    });
    expect(rungs(alerts)).toEqual(["1@30"]);
    expect(state.incidents[0]).toMatchObject({
      status: "resolved",
      resolution: "rejoined",
      resolvedAt: 60,
    });
  });

  it("separation plus silence escalates: the nudge upgrades in place to the unexplained ladder", () => {
    const { alerts, state } = run({ to: 120, evidence: darkAna(60, 61, 0) });
    expect(rungs(alerts)).toEqual(["1@25", "2@85", "3@90", "3@95"]);
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0]!.kind).toBe("unexplained_stop");
  });

  it("freezes the timer while she is silent, so time-apart-before-going-dark is preserved", () => {
    const { state, contract } = run({ to: 100, evidence: darkAna(60, 61, 20) });
    expect(state.people.ana!.apartSince).toBe(20);
    expect(separatedFor(contract, state, "ana", 100)).toBe(40); // up to her last report at 60
  });

  it("silence after only a brief separation is NOT 'unexplained' (duration rule)", () => {
    // Apart only from t=50 (10 min < 25) when she goes dark at 60.
    const { alerts } = run({ to: 160, evidence: darkAna(60, 61, 50) });
    expect(alerts.some((a) => a.kind === "unexplained_stop")).toBe(false);
    const first = alerts.find((a) => a.rung >= 2);
    expect(first?.kind).toBe("low_confidence"); // the score path still catches it, just later
    expect(first!.t).toBeGreaterThan(85);
  });

  it("a one-person group is never separated", () => {
    const c = makeContract({
      group: { members: ["ana"], watch: [] },
      wishes: { alert_order: [], offer_911_script: false },
    });
    const { alerts, state } = run({
      contract: c,
      to: 200,
      evidence: (t) => (t % 5 === 0 ? [ev("ana", t, { area: FAR })] : []),
    });
    expect(alerts).toEqual([]);
    expect(state.people.ana!.apartSince).toBeNull();
  });

  it("ignores stale peers: if nobody else is reporting, she is not 'separated'", () => {
    const { alerts } = run({
      to: 120,
      evidence: (t) => (t % 5 === 0 ? [ev("ana", t, { area: FAR })] : []), // bea and cy never report
    });
    expect(alerts.filter((a) => a.personId === "ana")).toEqual([]);
  });

  it("does not run for people who got home", () => {
    const { alerts, state } = run({
      to: 120,
      evidence: withAna((t) =>
        t % 5 === 0 && t <= 20 ? [ev("ana", t, { area: FAR, homeArrived: t === 20 })] : [],
      ),
    });
    expect(alerts).toEqual([]);
    expect(state.people.ana!.apartSince).toBeNull();
  });
});

describe("separation lowers confidence of normal", () => {
  it("separation alone, however long, never alerts a friend (capped)", () => {
    const { alerts } = run({ to: 400, evidence: darkAna(10_000, 61, 0) });
    expect(alerts.filter((a) => a.rung >= 2)).toEqual([]);
  });

  it("combined with a quiet phone it brings the score alert forward", () => {
    // Battery 15%: neither battery-death nor 'unexplained', so only the score path can fire.
    const first = (w: number) => {
      const base = makeContract();
      const c = makeContract({
        confidence: { ...base.confidence, separation: { w, tau_min: 15, cap: 0.4 } },
      });
      return run({ contract: c, to: 300, evidence: darkAna(60, 15, 0) }).alerts.find(
        (a) => a.rung >= 2,
      )?.t;
    };
    const without = first(0);
    const withSep = first(0.4);
    expect(without).toBeDefined();
    expect(withSep!).toBeLessThan(without!);
  });
});

describe("regression: going quiet while apart is not a rejoin", () => {
  it("keeps the separation nudge open (no cooldown) and lets the score path upgrade it", () => {
    // Battery 15% => 'quiet' (not unexplained, not battery death): only the score can take over.
    const base = makeContract();
    const c = makeContract({
      confidence: { ...base.confidence, separation: { w: 0, tau_min: 60, cap: 0.4 } },
    });
    const { alerts, state } = run({ contract: c, to: 200, evidence: darkAna(60, 15, 0) });
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0]!.kind).toBe("low_confidence");
    // score < 0.5 from t=77, sustained 10 min => concern at 87 => rung 2 after the 5 min ack
    expect(alerts.find((a) => a.rung >= 2)!.t).toBe(92);
  });
});

describe("rejoining starts no cooldown", () => {
  it("a second wander-off right after rejoining is nudged again once the timer completes", () => {
    // Apart 5-40 (nudge at 30), rejoin at 45, apart again from 50 (nudge at 75).
    const apart = (t: number) => (t >= 5 && t < 45) || t >= 50;
    const { alerts, state } = run({
      to: 120,
      evidence: withAna((t) => (t % 5 === 0 ? [ev("ana", t, { area: apart(t) ? FAR : A })] : [])),
    });
    expect(alerts.map((a) => `${a.rung}@${a.t}:${a.kind}`)).toEqual([
      "1@30:separation",
      "1@75:separation",
    ]);
    expect(state.incidents[0]).toMatchObject({ resolution: "rejoined", resolvedAt: 45 });
    expect(state.people.ana!.cooldownUntil).toBeNull();
  });
});

describe("coordinate rounding vs separation_m (150 m)", () => {
  // Locations are rounded to 0.001 deg (~111 m lat, ~80 m lon at Toronto) before the engine sees
  // them, so apparent distances are quantized: one cell step is 111 m of latitude but only ~80 m of
  // longitude. Two people really within ~80 m differ by at most one cell per axis (<= ~137 m apparent),
  // so they are never "apart". Between ~80 m and 150 m the flag can be a false positive (documented
  // limit: separation_m is only meaningful to about one grid cell).
  it("people really within 80 m are never flagged apart, wherever the rounding grid falls", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const mPerLat = 111_320;
    const mPerLon = 111_320 * Math.cos((43.65 * Math.PI) / 180);
    for (let i = 0; i < 2000; i++) {
      const lat = 43.6 + rand() * 0.1;
      const lon = -79.4 + rand() * 0.1;
      const r = rand() * 79;
      const th = rand() * 2 * Math.PI;
      const a = { lat, lon };
      const b = {
        lat: lat + (r * Math.sin(th)) / mPerLat,
        lon: lon + (r * Math.cos(th)) / mPerLon,
      };
      const c = makeContract({ group: { members: ["ana", "bea"], watch: [] } });
      const s = initialState(c);
      const rep = (id: string, area: { lat: number; lon: number }) =>
        ev(id, 0, {
          area: {
            lat: Math.round(area.lat * 1000) / 1000,
            lon: Math.round(area.lon * 1000) / 1000,
          },
        });
      for (const e of [rep("ana", a), rep("bea", b)]) {
        const p = s.people[e.personId]!;
        p.lastArea = e.area;
        p.lastReportAt = 0;
      }
      expect(isApart(c, s, "ana", 0), `${JSON.stringify([a, b])}`).toBe(false);
    }
  });
});
