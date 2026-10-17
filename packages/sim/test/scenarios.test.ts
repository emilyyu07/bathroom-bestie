import { describe, expect, it } from "vitest";
import { judge } from "../src/judge";
import { runScenario } from "../src/runner";
import { loadScenarios } from "../src/scenarios";

const scenarios = loadScenarios();

describe("scenarios", () => {
  it("has the thirteen scenarios", () => expect(scenarios).toHaveLength(13));
  for (const sc of scenarios) {
    it(`${sc.name} matches its label`, () => {
      const v = judge(sc, runScenario(sc));
      expect(v, JSON.stringify(v)).toMatchObject({ pass: true });
    });
    it(`${sc.name} replays deterministically`, () => {
      expect(JSON.stringify(runScenario(sc))).toEqual(JSON.stringify(runScenario(sc)));
    });
  }
});
