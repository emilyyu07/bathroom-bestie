import { describe, expect, it } from "vitest";
import { ev, run, darkAna } from "./helpers";

const rungs = (a: { rung: number; t: number }[]) => a.map((x) => `${x.rung}@${x.t}`);

describe("ladder", () => {
  it("escalates 1 -> 2 -> 3(next) -> 3(group) on ack timeouts when apart and silent", () => {
    const { alerts } = run({ to: 120, evidence: darkAna(60, 61, 30) });
    // apart from 30 -> separation nudge at 55; dark after 60 -> unexplained at 80 upgrades it; rung 2 at 85.
    expect(rungs(alerts)).toEqual(["1@55", "2@85", "3@90", "3@95"]);
    expect(alerts[0]).toMatchObject({ kind: "separation", to: ["ana"] });
    expect(alerts[1]).toMatchObject({ kind: "unexplained_stop", to: ["bea"] });
    expect(alerts[2]!.to).toEqual(["cy"]);
    expect(alerts[3]!.to).toEqual(["bea", "cy"]);
    expect(alerts[1]!.factors.length).toBeLessThanOrEqual(3);
    expect(alerts[1]!.lastKnown?.t).toBe(60);
  });

  it("is quiet on a normal night", () => {
    const { alerts } = run({ to: 300, evidence: darkAna(1000) });
    expect(alerts).toEqual([]);
  });

  it("resolves from any rung when evidence returns, then holds a 30 min cooldown", () => {
    const back = (t: number) => (t >= 92 && t < 200 ? [ev("ana", t, { motion: "walking" })] : []);
    const { alerts, state } = run({
      to: 200,
      evidence: (t) => [...darkAna(60, 61, 30)(t), ...back(t)],
    });
    expect(rungs(alerts)).toEqual(["1@55", "2@85", "3@90"]);
    const inc = state.incidents[0]!;
    expect(inc.status).toBe("resolved");
    expect(inc.resolution).toBe("evidence_returned");
    expect(inc.resolvedAt).toBe(92);
    expect(state.incidents).toHaveLength(1);
  });

  it("does not reopen during cooldown", () => {
    // Still apart but reporting again at 82 (the unexplained stop ends; resolves at rung 1), then
    // dark again after 83: unexplained would re-trigger at 103 < 82 + 30, so the cooldown holds it.
    const FAR = { lat: 43.66, lon: -79.38 };
    const ev2 = (t: number) => (t >= 82 && t <= 83 ? [ev("ana", t, { area: FAR })] : []);
    const { state } = run({ to: 109, evidence: (t) => [...darkAna(60, 61, 30)(t), ...ev2(t)] });
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0]!.resolvedAt).toBe(82);
  });

  it("treats battery <= 5% and falling as battery death: soft note, no alert", () => {
    const { alerts, state } = run({
      to: 200,
      evidence: (t) => {
        const base = darkAna(1000)(t).filter((e) => e.personId !== "ana");
        if (t <= 60 && t % 5 === 0) base.push(ev("ana", t, { batteryPct: t === 60 ? 3 : 8 }));
        return base;
      },
    });
    expect(alerts).toEqual([]);
    expect(state.notes).toHaveLength(1);
  });

  it("treats a revoked permission as evidence lost: rung 1 notify, never escalates", () => {
    const { alerts } = run({
      to: 200,
      evidence: (t) => [
        ...darkAna(1000)(t).filter((e) => e.personId !== "ana"),
        ...(t < 60 && t % 5 === 0 ? [ev("ana", t)] : []),
        ...(t === 60 ? [ev("ana", t, { permissionOk: false })] : []),
      ],
    });
    expect(alerts.map((a) => [a.rung, a.kind])).toEqual([[1, "evidence_lost"]]);
  });

  it("is deterministic", () => {
    const a = run({ to: 150, evidence: darkAna(60) });
    const b = run({ to: 150, evidence: darkAna(60) });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
