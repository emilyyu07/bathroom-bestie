import { describe, expect, it } from "vitest";
import { EvidenceReport, contractJsonSchema, roundCoord } from "../src";

describe("schema", () => {
  it("rounds evidence location on parse", () => {
    const e = EvidenceReport.parse({
      personId: "a",
      contractId: "c",
      t: 1,
      area: { lat: 43.65321, lon: -79.38329 },
      motion: "still",
      batteryPct: 50,
      charging: false,
      permissionOk: true,
    });
    expect(e.area).toEqual({ lat: 43.653, lon: -79.383 });
    expect(roundCoord(43.6565)).toBe(43.657);
  });
  it("exports a JSON schema for the contract", () => {
    expect(contractJsonSchema()).toHaveProperty("properties.thresholds");
  });
});

import {
  Contract,
  Milestone,
  PRESETS,
  PRESET_ORDER,
  makeContract,
  normalizeContract,
  thresholdsFor,
} from "../src";

describe("milestones", () => {
  const circle = { center: { lat: 43.65, lon: -79.38 }, radius_m: 300 };
  it("accepts area and home kinds, with optional who", () => {
    expect(Milestone.parse({ id: "a", kind: "area", by: 10, within: circle }).kind).toBe("area");
    expect(Milestone.parse({ id: "h", kind: "home", by: 10, who: ["me"] })).toMatchObject({
      who: ["me"],
    });
  });
  it("rejects a missing kind or an area milestone without a circle", () => {
    expect(() => Milestone.parse({ id: "x", by: 10 })).toThrow();
    expect(() => Milestone.parse({ id: "x", kind: "area", by: 10 })).toThrow();
  });
  it("rounds an area milestone's centre like every other location", () => {
    const m = Milestone.parse({
      id: "a",
      kind: "area",
      by: 10,
      within: { center: { lat: 43.65321, lon: -79.38377 }, radius_m: 200 },
    });
    expect(m.kind === "area" && m.within.center).toEqual({ lat: 43.653, lon: -79.384 });
  });
});

describe("new thresholds are per-preset data", () => {
  it("flow from the preset into the contract thresholds", () => {
    expect(thresholdsFor("cautious")).toMatchObject({ milestone_grace_min: 5, exit_alone_min: 30 });
  });
  it("a more cautious preset is never slower on either", () => {
    for (const key of ["milestone_grace_min", "exit_alone_min"] as const) {
      const v = PRESET_ORDER.map((p) => PRESETS[p][key]);
      expect(v[0]! >= v[1]! && v[1]! >= v[2]!).toBe(true);
    }
  });
});

describe("normalizeContract", () => {
  const legacy = (preset: "relaxed" | "standard" | "cautious") => {
    const c = JSON.parse(
      JSON.stringify(makeContract({ preset, thresholds: thresholdsFor(preset) })),
    );
    delete c.thresholds.milestone_grace_min; // stored before these thresholds existed
    delete c.thresholds.exit_alone_min;
    delete c.confidence.separation;
    return c;
  };
  it("fills missing thresholds from the contract's own preset, not a static default", () => {
    expect(normalizeContract(legacy("cautious")).thresholds).toMatchObject({
      milestone_grace_min: 5,
      exit_alone_min: 30,
    });
    expect(normalizeContract(legacy("relaxed")).thresholds).toMatchObject({
      milestone_grace_min: 20,
      exit_alone_min: 60,
    });
  });
  it("keeps explicitly stored values", () => {
    const c = legacy("standard");
    c.thresholds.exit_alone_min = 99;
    expect(normalizeContract(c).thresholds.exit_alone_min).toBe(99);
  });
  it("also applies schema defaults (separation stream) and rejects garbage", () => {
    expect(normalizeContract(legacy("standard")).confidence.separation.cap).toBe(0.4);
    expect(() => normalizeContract({ nonsense: true })).toThrow();
    expect(() => normalizeContract(null)).toThrow();
  });
  it("is the identity on a current contract", () => {
    const c = makeContract();
    expect(normalizeContract(JSON.parse(JSON.stringify(c)))).toEqual(Contract.parse(c));
  });
});

describe("milestone guards", () => {
  const circle = (radius_m: number) => ({ center: { lat: 43.65, lon: -79.38 }, radius_m });

  it("rejects an area milestone smaller than the location rounding can resolve (< 200 m)", () => {
    expect(() => Milestone.parse({ id: "a", kind: "area", by: 10, within: circle(150) })).toThrow();
    expect(Milestone.parse({ id: "a", kind: "area", by: 10, within: circle(200) }).kind).toBe(
      "area",
    );
  });

  const c = makeContract(); // window.end 360, expires 480, standard grace 10
  const withHome = (by: number, expires: number) =>
    Contract.safeParse({ ...c, expires, milestones: [{ id: "home", kind: "home", by }] });

  it("accepts a contract whose expires covers the window and every deadline plus grace", () => {
    expect(withHome(470, 480).success).toBe(true); // 470 + 10 = 480
  });
  it("rejects a milestone the engine would stop watching before judging", () => {
    const r = withHome(471, 480);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.path).toEqual(["expires"]);
  });
  it("rejects expires before the end of the window", () => {
    expect(Contract.safeParse({ ...c, expires: c.window.end - 1 }).success).toBe(false);
  });
  it("normalizeContract enforces the same guard on stored contracts", () => {
    const raw = JSON.parse(JSON.stringify({ ...c, expires: 100 }));
    expect(() => normalizeContract(raw)).toThrow();
  });
});
