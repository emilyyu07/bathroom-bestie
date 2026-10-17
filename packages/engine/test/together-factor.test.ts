import { describe, expect, it } from "vitest";
import { FACTOR_TEMPLATES } from "../src";
import { darkAna, ev, run } from "./helpers";

const NEARBY = FACTOR_TEMPLATES.togetherNearby;
describe("group still together nearby (context only)", () => {
  it("is added when her phone is quiet but the others, still reporting, were last near her", () => {
    const { alerts } = run({ to: 120, evidence: darkAna(60) });
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) expect(a.factors).toContain(NEARBY);
    // It is one of at most three factors, shown after how long it has been quiet.
    expect(alerts[0]!.factors.slice(0, 2)).toEqual(["No update for 27 min", NEARBY]);
  });

  it("is not added when she was already apart from them", () => {
    // Apart from 30, dark from 60: the others are ~1.1 km from where she was last seen.
    const { alerts } = run({ to: 120, evidence: darkAna(60, 61, 30) });
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) expect(a.factors).not.toContain(NEARBY);
  });

  it("is not added when the others have gone quiet too (nobody is vouching for the area)", () => {
    const { alerts } = run({
      to: 120,
      evidence: (t) => (t % 5 === 0 && t <= 60 ? [ev("ana", t), ev("bea", t), ev("cy", t)] : []),
    });
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) expect(a.factors).not.toContain(NEARBY);
  });

  it("does not change detection: the alerts keep the same rungs, times and kinds", () => {
    const { alerts } = run({ to: 120, evidence: darkAna(60) });
    expect(alerts.map((a) => `${a.rung}@${a.t}:${a.kind}`)).toEqual([
      "1@87:low_confidence",
      "2@92:low_confidence",
      "3@97:escalation",
      "3@102:escalation",
    ]);
  });

  it("also shows on a friend's worry about a quiet phone, so the friend sees the context", () => {
    const { alerts } = run({
      to: 70,
      evidence: darkAna(50),
      actions: [{ type: "worry", by: "cy", targetPersonId: "ana", t: 66 }],
    });
    const said = alerts.find((a) => a.kind === "friend_worry")!;
    expect(said.factors).toContain(NEARBY);
  });
});
