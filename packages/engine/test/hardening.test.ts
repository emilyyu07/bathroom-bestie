import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport } from "@bathroombestie/schema";
import { evaluate, initialState, type EngineState } from "../src";
import { darkAna, ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };

/** Feed batches of evidence in the order given, one `evaluate` per entry (like the runner's ticks). */
const feed = (batches: { now: number; evidence: EvidenceReport[] }[]) => {
  const contract = makeContract();
  let state: EngineState = initialState(contract);
  for (const b of batches)
    state = evaluate({ contract, state, evidence: b.evidence, actions: [], now: b.now }).state;
  return state;
};

describe("out-of-order and repeated evidence", () => {
  it("a late report older than the newest one does not roll her location, battery or motion back", () => {
    const state = feed([
      { now: 60, evidence: [ev("ana", 60, { area: FAR, batteryPct: 40, motion: "walking" })] },
      // Delivered afterwards (a retry, or a buffered flush): older, at the bar, higher battery, still.
      { now: 62, evidence: [ev("ana", 55, { area: A, batteryPct: 70, motion: "still" })] },
    ]);
    const p = state.people.ana!;
    expect(p.lastReportAt).toBe(60);
    expect(p.lastArea).toEqual(FAR);
    expect(p.lastBattery).toBe(40);
    expect(p.lastMotion).toBe("walking");
  });

  it("a late report still counts for things that happened: arriving home, reaching a place", () => {
    const state = feed([
      { now: 60, evidence: [ev("ana", 60, { area: FAR })] },
      { now: 62, evidence: [{ ...ev("ana", 58), homeArrived: true, area: undefined }] },
    ]);
    expect(state.people.ana!.home).toBe(true);
  });

  it("the same report delivered twice changes nothing a second time", () => {
    const once = feed([{ now: 10, evidence: [ev("ana", 10, { batteryPct: 40 })] }]);
    const twice = feed([
      { now: 10, evidence: [ev("ana", 10, { batteryPct: 40 })] },
      { now: 11, evidence: [ev("ana", 10, { batteryPct: 40 })] },
    ]);
    const strip = (s: EngineState) => ({ ...s.people.ana!, prevBattery: 0 });
    expect(strip(twice)).toEqual(strip(once));
  });

  it("reports out of order inside one batch are applied in time order", () => {
    const state = feed([
      { now: 20, evidence: [ev("ana", 20, { area: FAR }), ev("ana", 15, { area: A })] },
    ]);
    expect(state.people.ana!.lastArea).toEqual(FAR);
  });
});

describe("after the contract expires", () => {
  it("no alert is raised for silence once the night is over", () => {
    const contract = makeContract(); // expires at 480
    const { alerts } = run({ contract, to: 700, evidence: darkAna(60) });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.t <= contract.expires)).toBe(true);
  });

  it("a report that arrives after expiry raises nothing and breaks nothing", () => {
    const contract = makeContract();
    const { alerts } = run({
      contract,
      to: 600,
      evidence: (t) => (t === 550 ? [ev("ana", 550), ev("bea", 550), ev("cy", 550)] : []),
    });
    expect(alerts.every((a) => a.t <= contract.expires)).toBe(true);
  });
});

describe("two people in trouble at once", () => {
  it("raises separate incidents, each to the right people, without mixing them up", () => {
    // ana and cy both go dark at 60; bea keeps reporting.
    const { alerts, state } = run({
      to: 120,
      evidence: (t) =>
        t % 5 !== 0 ? [] : [ev("bea", t), ...(t <= 60 ? [ev("ana", t), ev("cy", t)] : [])],
    });
    const about = (id: string) => alerts.filter((a) => a.personId === id);
    expect(about("ana").length).toBeGreaterThan(0);
    expect(about("cy").length).toBeGreaterThan(0);
    // One open incident per person, never two for the same person.
    for (const id of ["ana", "cy"])
      expect(state.incidents.filter((i) => i.personId === id && i.status === "open")).toHaveLength(
        1,
      );
    // Nobody is ever alerted about their own incident beyond the first (nudge) rung.
    for (const a of alerts.filter((x) => x.rung > 1)) expect(a.to).not.toContain(a.personId);
    // Alert ids are unique across the two incidents.
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
  });

  it("resolving one does not resolve the other", () => {
    const { state } = run({
      to: 100,
      evidence: (t) =>
        t % 5 !== 0
          ? []
          : [
              ev("bea", t),
              ...(t <= 60 ? [ev("ana", t), ev("cy", t)] : []),
              ...(t >= 80 ? [ev("ana", t)] : []),
            ],
    });
    const ana = state.incidents.filter((i) => i.personId === "ana");
    const cy = state.incidents.filter((i) => i.personId === "cy");
    expect(ana.every((i) => i.status === "resolved")).toBe(true);
    expect(cy.some((i) => i.status === "open")).toBe(true);
  });
});
