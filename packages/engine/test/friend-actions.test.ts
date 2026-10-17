import { describe, expect, it } from "vitest";
import type { FriendAction } from "@bathroombestie/schema";
import { run, darkAna } from "./helpers";

const confirm = (t: number, by = "bea"): FriendAction => ({
  type: "confirm",
  by,
  targetPersonId: "ana",
  t,
});
const worry = (t: number, by: string, reason?: FriendAction["reason"]): FriendAction => ({
  type: "worry",
  by,
  targetPersonId: "ana",
  t,
  reason,
});

describe("friend confirm", () => {
  // Incident opens at 80 (rung 1), 85 (rung 2), 90 (rung 3 next), 95 (rung 3 group).
  for (const [label, t, rung] of [
    ["rung 1", 82, 1],
    ["rung 2", 87, 2],
    ["rung 3 (next)", 92, 3],
    ["rung 3 (group)", 100, 3],
  ] as const) {
    it(`resolves at ${label}, records who, starts cooldown`, () => {
      const { state, alerts } = run({
        to: t + 25,
        evidence: darkAna(60),
        actions: [confirm(t, "cy")],
      });
      const inc = state.incidents[0]!;
      expect(inc.rung).toBe(rung);
      expect(inc.status).toBe("resolved");
      expect(inc.resolution).toBe("confirmed");
      expect(inc.confirmedBy).toBe("cy");
      expect(state.people.ana!.cooldownUntil).toBe(t + 30);
      expect(state.incidents).toHaveLength(1);
      expect(alerts.every((a) => a.t <= t)).toBe(true);
    });
  }
  it("resolves a rung-4 incident", () => {
    const { state } = run({
      to: 120,
      evidence: darkAna(60),
      actions: [worry(88, "bea"), confirm(100, "cy")],
    });
    expect(state.incidents[0]!.rung).toBe(4);
    expect(state.incidents[0]!.status).toBe("resolved");
  });
  it("is logged and ignored when nothing is open", () => {
    const { state } = run({ to: 20, evidence: darkAna(1000), actions: [confirm(10)] });
    expect(state.actionLog[0]!.outcome).toBe("ignored");
  });
});

describe("friend worry", () => {
  it("opens a rung-2 incident despite normal evidence, naming the friend and reason", () => {
    const { alerts } = run({
      to: 32,
      evidence: darkAna(1000),
      actions: [worry(30, "cy", "cant_find")],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ rung: 2, raisedBy: "cy", personId: "ana", to: ["bea"] });
    expect(alerts[0]!.message).toContain("cy");
    expect(alerts[0]!.message).toContain("can't find ana");
  });

  it("works with zero evidence at all", () => {
    const { alerts } = run({
      to: 7,
      evidence: () => [],
      actions: [worry(5, "cy", "not_answering")],
    });
    expect(alerts.map((a) => a.rung)).toEqual([2]);
  });

  it("stays open under normal evidence and escalates on ack timeout", () => {
    const { alerts, state } = run({ to: 60, evidence: darkAna(1000), actions: [worry(30, "cy")] });
    expect(alerts.map((a) => `${a.rung}@${a.t}`)).toEqual(["2@30", "3@35", "3@40"]);
    expect(state.incidents[0]!.status).toBe("open");
  });

  it("goes straight to rung-4 tools when the worrier is the watcher", () => {
    const { alerts } = run({
      to: 32,
      evidence: darkAna(1000),
      actions: [worry(30, "bea", "feels_off")],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ rung: 4, to: ["bea"], raisedBy: "bea" });
    expect(alerts[0]!.script911).toBeTruthy();
  });

  it("rate limits one worry per friend per person per 15 min, but not other friends", () => {
    const { state } = run({
      to: 60,
      evidence: darkAna(1000),
      actions: [worry(30, "cy"), worry(40, "cy"), worry(41, "bea"), worry(46, "cy")],
    });
    expect(state.actionLog.map((l) => l.outcome)).toEqual([
      "applied",
      "rate_limited",
      "applied",
      "applied",
    ]);
  });

  it("ignores self-reports", () => {
    const { state } = run({ to: 10, evidence: () => [], actions: [worry(5, "ana")] });
    expect(state.actionLog[0]!.outcome).toBe("ignored");
  });
});
