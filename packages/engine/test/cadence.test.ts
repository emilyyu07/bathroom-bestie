import { describe, expect, it } from "vitest";
import { makeContract, thresholdsFor, type EvidenceReport } from "@bathroombestie/schema";
import { ev, run } from "./helpers";

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 };
const cautious = () => makeContract({ preset: "cautious", thresholds: thresholdsFor("cautious") });

/**
 * bea and cy stay at A and report every `every` min. ana is apart from the group (FAR) and
 * reports every `every` min except at the minutes in `missing`.
 */
const feed =
  (every: number, anaStopsAfter: number, missing: number[] = []) =>
  (t: number): EvidenceReport[] => {
    if (t % every !== 0) return [];
    const out = [ev("bea", t, { area: A }), ev("cy", t, { area: A })];
    if (t <= anaStopsAfter && !missing.includes(t)) out.push(ev("ana", t, { area: FAR }));
    return out;
  };

const friendAlerts = (alerts: { rung: number; t: number; personId: string }[]) =>
  alerts.filter((a) => a.personId === "ana" && a.rung >= 2);

describe("detection timing does not depend on how often phones report", () => {
  // Last report at minute 60 (a multiple of 1, 2, 3 and 5). Cautious: silent at 12, ack 3.
  for (const every of [1, 2, 3, 5]) {
    it(`cautious: a friend is alerted 15 min after the last report at a ${every}-min cadence`, () => {
      const { alerts } = run({ contract: cautious(), to: 120, evidence: feed(every, 60) });
      expect(friendAlerts(alerts)[0]).toMatchObject({ rung: 2, t: 75 });
    });
  }
});

describe("cautious at the default 3-min cadence: 12 min of silence = 4 reports", () => {
  // Last report at 30; reports are due at 33, 36, 39, 42, 45, ...
  const last = 30;
  const resumeAt = (t: number) => {
    const missing: number[] = [];
    for (let m = last + 3; m < t; m += 3) missing.push(m);
    return missing;
  };
  const alertsWhenResumingAt = (t: number) =>
    friendAlerts(run({ contract: cautious(), to: 90, evidence: feed(3, 90, resumeAt(t)) }).alerts);

  it("resuming at +12 (3 reports missed) never reaches a friend", () => {
    expect(alertsWhenResumingAt(42)).toEqual([]);
  });
  it("resuming at +15 (4 missed): the state turned hard at +12 but the report at +15 ends it first", () => {
    expect(alertsWhenResumingAt(45)).toEqual([]);
  });
  it("resuming at +18 (5 missed): a friend is alerted at +15", () => {
    expect(alertsWhenResumingAt(48)[0]).toMatchObject({ rung: 2, t: 45 });
  });
});
