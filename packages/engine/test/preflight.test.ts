import { describe, expect, it } from "vitest";
import { makeContract, type ReadinessSnapshot } from "@bathroombestie/schema";
import { preflight } from "../src";

const good: ReadinessSnapshot = {
  permissions: { backgroundLocation: true, notifications: true },
  battery: { level: 90, restricted: false, lowPowerMode: false },
  connectivityRttMs: 300,
  firstEvidenceAfterS: 12,
  watchers: [
    { id: "bea", accepted: true, reachable: true },
    { id: "cy", accepted: true, reachable: true },
  ],
  homeGeofenceSet: true,
  contractConfirmed: true,
};
const c = makeContract();
const failed = (s: ReadinessSnapshot) =>
  preflight(s, c)
    .checks.filter((x) => x.status === "fail")
    .map((x) => x.id);

describe("preflight", () => {
  it("ready when everything passes", () => {
    expect(preflight(good, c)).toMatchObject({ state: "ready" });
    expect(failed(good)).toEqual([]);
  });

  const blocking: [string, ReadinessSnapshot][] = [
    [
      "background_location",
      { ...good, permissions: { ...good.permissions, backgroundLocation: false } },
    ],
    ["notifications", { ...good, permissions: { ...good.permissions, notifications: false } }],
    ["connectivity", { ...good, connectivityRttMs: 5000 }],
    ["connectivity", { ...good, connectivityRttMs: null }],
    ["first_evidence", { ...good, firstEvidenceAfterS: 61 }],
    ["first_evidence", { ...good, firstEvidenceAfterS: null }],
    ["watcher", { ...good, watchers: [{ id: "bea", accepted: true, reachable: false }] }],
    ["watcher", { ...good, watchers: [{ id: "bea", accepted: false, reachable: true }] }],
    ["contract_confirmed", { ...good, contractConfirmed: false }],
  ];
  for (const [id, snap] of blocking) {
    it(`blocks on ${id}`, () => {
      const r = preflight(snap, c);
      expect(r.state).toBe("not_ready");
      expect(failed(snap)).toContain(id);
    });
  }

  const warnings: [string, ReadinessSnapshot][] = [
    ["battery_settings", { ...good, battery: { ...good.battery, restricted: true } }],
    ["battery_settings", { ...good, battery: { ...good.battery, lowPowerMode: true } }],
    ["starting_battery", { ...good, battery: { ...good.battery, level: 39 } }],
    ["watcher_count", { ...good, watchers: [good.watchers[0]!] }],
    ["home_geofence", { ...good, homeGeofenceSet: false }],
  ];
  for (const [id, snap] of warnings) {
    it(`warns on ${id}`, () => {
      expect(preflight(snap, c).state).toBe("ready_with_warnings");
      expect(failed(snap)).toEqual([id]);
    });
  }

  it("edge values pass: 4999 ms, 60 s, 40%", () => {
    expect(
      preflight(
        {
          ...good,
          connectivityRttMs: 4999,
          firstEvidenceAfterS: 60,
          battery: { ...good.battery, level: 40 },
        },
        c,
      ).state,
    ).toBe("ready");
  });
  it("blocking beats warnings", () => {
    expect(preflight({ ...good, homeGeofenceSet: false, contractConfirmed: false }, c).state).toBe(
      "not_ready",
    );
  });
  it("is deterministic", () => {
    expect(preflight(good, c)).toEqual(preflight(good, c));
  });
});
