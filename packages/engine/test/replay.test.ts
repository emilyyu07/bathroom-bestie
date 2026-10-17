import { describe, expect, it } from "vitest";
import { makeContract, type EvidenceReport } from "@bathroombestie/schema";
import { ENGINE_STATE_VERSION, evaluate, initialState, rebuild, replay } from "../src";
import { darkAna, ev, run } from "./helpers";

const logs = (to: number, f: (t: number) => EvidenceReport[]) => {
  const evidence: EvidenceReport[] = [];
  for (let t = 0; t <= to; t++) evidence.push(...f(t));
  return evidence;
};

describe("state is derived (invariant 2)", () => {
  const feed = darkAna(60, 61, 30);
  const actions = [{ type: "worry" as const, by: "cy", targetPersonId: "ana", t: 100 }];

  it("replaying the logs reproduces the live minute-by-minute fold exactly", () => {
    const live = run({ to: 150, evidence: feed, actions });
    const contract = makeContract();
    const r = replay({ contract, evidence: logs(150, feed), actions, to: 150 });
    expect(JSON.stringify(r.state)).toEqual(JSON.stringify(live.state));
    expect(JSON.stringify(r.alerts)).toEqual(JSON.stringify(live.alerts));
  });

  it("rebuild() returns just the state", () => {
    const contract = makeContract();
    const s = rebuild({ contract, evidence: logs(100, feed), actions: [], to: 100 });
    expect(s.version).toBe(ENGINE_STATE_VERSION);
    expect(s.lastEvalAt).toBe(100);
  });

  it("evaluate refuses a state from another engine version", () => {
    const contract = makeContract();
    const stale = { ...initialState(contract), version: ENGINE_STATE_VERSION - 1 };
    expect(() => evaluate({ contract, state: stale, evidence: [], actions: [], now: 1 })).toThrow(
      /rebuild/,
    );
  });

  it("delivers pre-window evidence at the window start", () => {
    const contract = makeContract({ window: { start: 10, end: 400 } });
    const s = rebuild({ contract, evidence: [ev("ana", 3)], actions: [], to: 12 });
    expect(s.people.ana!.lastReportAt).toBe(3);
  });
});
