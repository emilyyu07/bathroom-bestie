import { beforeEach, describe, expect, it } from "vitest";
import type { ReadinessSnapshot } from "@bathroombestie/schema";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { tick } from "../src/runner";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";

const good: ReadinessSnapshot = {
  permissions: { backgroundLocation: true, notifications: true },
  battery: { level: 90, restricted: false, lowPowerMode: false },
  connectivityRttMs: 300,
  firstEvidenceAfterS: 10,
  watchers: [{ id: "bea", accepted: true, reachable: true }],
  homeGeofenceSet: true,
  contractConfirmed: true,
};

let store: MemoryStore, clock: FakeClock, app: ReturnType<typeof buildServer>;
beforeEach(() => {
  store = new MemoryStore();
  clock = new FakeClock(1_000_000);
  app = buildServer({ store, clock, compiler: new MockCompiler() });
});

const compile = async () =>
  (
    await app.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Going out with Bea and Cy until 2am for 6 hours, careful please" },
    })
  ).json();

describe("api", () => {
  it("compiles a sentence into a validated contract with a read-back", async () => {
    const r = await compile();
    expect(r.contract.group.members).toEqual(["me", "bea", "cy"]);
    expect(r.contract.preset).toBe("cautious");
    expect(r.contract.thresholds.silence_min).toBe(12);
    expect(r.readBack).toContain("bea");
    expect(r.terms.length).toBeGreaterThan(0);
  });

  it("rejects bad input with 400", async () => {
    const r = await app.inject({ method: "POST", url: "/contracts/compile", payload: {} });
    expect(r.statusCode).toBe(400);
  });

  it("activate is 409 until preflight is ready or ready_with_warnings", async () => {
    const { contract } = await compile();
    const act = () => app.inject({ method: "POST", url: `/contracts/${contract.id}/activate` });
    expect((await act()).statusCode).toBe(409);
    const bad = await app.inject({
      method: "POST",
      url: "/preflight",
      payload: { contractId: contract.id, snapshot: { ...good, contractConfirmed: false } },
    });
    expect(bad.json().state).toBe("not_ready");
    expect((await act()).statusCode).toBe(409);
    const warn = await app.inject({
      method: "POST",
      url: "/preflight",
      payload: { contractId: contract.id, snapshot: good },
    });
    expect(warn.json().state).toBe("ready_with_warnings"); // one watcher
    expect((await act()).statusCode).toBe(200);
  });

  it("rounds evidence location before storage", async () => {
    const { contract } = await compile();
    const r = await app.inject({
      method: "POST",
      url: "/evidence",
      payload: {
        personId: "me",
        contractId: contract.id,
        t: clock.nowMinute(),
        area: { lat: 43.65321, lon: -79.38377 },
        motion: "walking",
        batteryPct: 70,
        charging: false,
        permissionOk: true,
      },
    });
    expect(r.statusCode).toBe(202);
    expect(store.evidence[0]!.e.area).toEqual({ lat: 43.653, lon: -79.384 });
  });

  it("runner turns a friend worry into a listed alert, with the injected clock", async () => {
    const { contract } = await compile();
    await app.inject({
      method: "POST",
      url: "/preflight",
      payload: { contractId: contract.id, snapshot: good },
    });
    await app.inject({ method: "POST", url: `/contracts/${contract.id}/activate` });
    await tick(store, clock); // establishes lastEvalAt
    clock.t += 5;
    const a = await app.inject({
      method: "POST",
      url: "/actions",
      payload: {
        contractId: contract.id,
        type: "worry",
        by: "cy",
        targetPersonId: "me",
        reason: "cant_find",
      },
    });
    expect(a.statusCode).toBe(202);
    await tick(store, clock);
    const list = (
      await app.inject({ method: "GET", url: `/incidents?contractId=${contract.id}` })
    ).json();
    expect(list.alerts[0]).toMatchObject({ rung: 2, raisedBy: "cy", personId: "me" });
    expect(list.alerts[0].message).toContain("cy");
  });

  it("runner never skips a row that was not yet due when a later-seq row was delivered", async () => {
    const { contract } = await compile();
    await store.activate(contract.id);
    const T = clock.nowMinute();
    await tick(store, clock);
    const ev = (personId: string, t: number) => ({
      personId,
      contractId: contract.id,
      t,
      area: { lat: 43.65, lon: -79.38 },
      motion: "walking" as const,
      batteryPct: 70,
      charging: false,
      permissionOk: true,
    });
    await store.addEvidence(ev("me", T + 1)); // lower seq, due next minute
    await store.addEvidence(ev("bea", T)); // higher seq, due now
    await tick(store, clock);
    clock.t += 1;
    await tick(store, clock);
    const { state } = (await store.getEngine(contract.id))!;
    expect(state.people.bea!.lastReportAt).toBe(T);
    expect(state.people.me!.lastReportAt).toBe(T + 1);
  });
});
