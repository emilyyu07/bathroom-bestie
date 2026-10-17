import { describe, expect, it } from "vitest";
import { PRESET_ORDER, makeContract, type PresetName, type ScenarioFile } from "@tether/schema";
import { runScenario } from "../src/runner";
import { loadScenarios } from "../src/scenarios";
import { sweepScenarios, toCsv } from "../src/sweepCore";

describe("sweep", () => {
  it("is deterministic", () => {
    const a = sweepScenarios(loadScenarios());
    const b = sweepScenarios(loadScenarios());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(toCsv(a)).toEqual(toCsv(b));
  });
});

// Tiny seeded PRNG so failures reproduce.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const firstAlert = (sc: ScenarioFile, p: PresetName): number =>
  runScenario(sc, p).alerts.find((a) => a.rung >= 2)?.t ?? Infinity;

describe("property: a more cautious preset never alerts later than a more relaxed one", () => {
  const rand = rng(42);
  const FAR = { lat: 43.66, lon: -79.38 };
  const A = { lat: 43.65, lon: -79.38 };
  for (let i = 0; i < 60; i++) {
    const darkFrom = 20 + 5 * Math.floor(rand() * 40);
    const battery = 6 + Math.floor(rand() * 94);
    const apart = rand() < 0.7;
    it(`random case ${i}: dark from ${darkFrom}, ${battery}%, ${apart ? "apart" : "together"}`, () => {
      const rep = (id: string, area: typeof A, to: number, b = 80) =>
        Array.from({ length: Math.floor(to / 5) + 1 }, (_, k) => ({
          at: k * 5,
          evidence: { area, motion: "walking" as const, batteryPct: b, charging: false, permissionOk: true },
        }));
      const sc = {
        name: `rand-${i}`,
        description: "",
        contract: makeContract(),
        timelines: { ana: rep("ana", apart ? FAR : A, darkFrom, battery), bea: rep("bea", A, 300), cy: rep("cy", A, 300) },
        actions: [],
        durationMin: 300,
        truth: "concerning",
        label: { expect: "no_alert" },
      } as ScenarioFile;
      const t = PRESET_ORDER.map((p) => firstAlert(sc, p));
      expect(t[1]!, `relaxed=${t[0]} standard=${t[1]}`).toBeLessThanOrEqual(t[0]!);
      expect(t[2]!, `standard=${t[1]} cautious=${t[2]}`).toBeLessThanOrEqual(t[1]!);
    });
  }
});
