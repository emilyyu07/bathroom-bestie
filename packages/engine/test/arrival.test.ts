import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport } from "@bathroombestie/schema";
import { replay } from "../src";
import { darkAna, run } from "./helpers";

const arrival = (personId: string, t: number): EvidenceReport => ({
  personId,
  contractId: "c1",
  t,
  motion: "still",
  batteryPct: 50,
  charging: false,
  permissionOk: true,
  homeArrived: true, // no area: an arrival is an event, not a place
});

/** The app stops reporting once she is home, so her feed ends at the arrival. */
const stopsAt = (arrivalT: number, base: (t: number) => EvidenceReport[]) => (t: number) => [
  ...base(t).filter((e) => e.personId !== "ana" || t < arrivalT),
  ...(t === arrivalT ? [arrival("ana", arrivalT)] : []),
];

describe("arrival reports", () => {
  it("mark her home without any location", () => {
    const { state } = run({
      to: 30,
      evidence: stopsAt(20, darkAna(10_000)),
    });
    expect(state.people.ana!.home).toBe(true);
    expect(state.people.ana!.lastReportAt).toBe(20);
  });

  it("never touch the location logic, even if an area came with them", () => {
    const withArea: EvidenceReport = { ...arrival("ana", 20), area: { lat: 40.0, lon: -70.0 } }; // far outside
    const { state } = run({
      to: 30,
      evidence: (t) => [
        ...darkAna(10_000)(t).filter((e) => e.personId !== "ana" || t < 20),
        ...(t === 20 ? [withArea] : []),
      ],
    });
    const p = state.people.ana!;
    expect(p.home).toBe(true);
    expect(p.lastArea).toEqual({ lat: 43.65, lon: -79.38 }); // still her last real report (t=15)
    expect(p.lastCorridorAt).toBe(15);
  });

  it("end an open incident as 'home' and keep her quiet afterwards", () => {
    // Apart and silent from 60 (an unexplained-stop incident opens), then she gets home at 90.
    const { state, alerts } = run({
      to: 200,
      evidence: (t) => [...darkAna(60, 61, 30)(t), ...(t === 90 ? [arrival("ana", 90)] : [])],
    });
    const inc = state.incidents.find((i) => i.personId === "ana")!;
    expect(inc).toMatchObject({ status: "resolved", resolution: "home", resolvedAt: 90 });
    expect(alerts.filter((a) => a.personId === "ana" && a.t > 90)).toEqual([]);
  });

  it("ignore any later report from her: once home, nothing moves", () => {
    // Her feed keeps going after the arrival (e.g. a buggy client); it must not change her state.
    const { state } = run({
      to: 40,
      evidence: (t) => [...darkAna(10_000)(t), ...(t === 20 ? [arrival("ana", 20)] : [])],
    });
    const p = state.people.ana!;
    expect(p.home).toBe(true);
    expect(p.lastArea).toEqual({ lat: 43.65, lon: -79.38 });
  });

  it("an arrival without an area is valid for the replay path too", () => {
    const f = stopsAt(20, darkAna(10_000));
    const live = run({ to: 60, evidence: f });
    const evidence: EvidenceReport[] = [];
    for (let t = 0; t <= 60; t++) evidence.push(...f(t));
    const r = replay({ contract: makeContract(), evidence, actions: [], to: 60 });
    expect(JSON.stringify(r.state)).toEqual(JSON.stringify(live.state));
  });
});
