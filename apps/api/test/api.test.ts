import { beforeEach, describe, expect, it } from "vitest";
import type { ReadinessSnapshot } from "@bathroombestie/schema";
import { FakeClock } from "../src/clock";
import { MockCompiler, withRetry, type CompileContext, type Compiler } from "../src/compile";
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

  it("normalises model names, passes local time, and replaces a read-back with banned words", async () => {
    let seen: CompileContext | undefined;
    const stub: Compiler = {
      async draft(_s, ctx) {
        seen = ctx;
        return {
          friends: [" Bea", "CY", "bea"],
          hours: 4,
          radius_m: 1000,
          preset: "standard",
          watch_order: ["Cy"],
          offer_911_script: true,
          read_back: "You'll be out with Bea and Cy. Don't get drunk!",
        };
      },
    };
    const app2 = buildServer({ store, clock, compiler: stub });
    const r = await app2.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea and Cy", localTime: "21:30" },
    });
    expect(r.statusCode).toBe(200);
    expect(seen?.localTime).toBe("21:30");
    const { contract, readBack } = r.json();
    expect(contract.group.members).toEqual(["me", "bea", "cy"]);
    expect(contract.wishes.alert_order).toEqual(["cy", "bea"]);
    expect(readBack).not.toMatch(/drunk/i);
    expect(readBack).toContain("Watching: cy, bea");
    const bad = await app2.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea", localTime: "9pm" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("compile failures are a retryable 503, not a 400 or 500", async () => {
    const down: Compiler = {
      async draft() {
        throw new Error("model unavailable");
      },
    };
    const app2 = buildServer({ store, clock, compiler: down });
    const r = await app2.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea" },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ error: "compiler_unavailable" });
  });

  it("withRetry retries only retryable errors, then gives up", async () => {
    let n = 0;
    const flaky = () => (++n < 3 ? Promise.reject(new Error("busy")) : Promise.resolve("ok"));
    expect(await withRetry(flaky, [0, 0], () => true)).toBe("ok");
    n = 0;
    await expect(withRetry(flaky, [0], () => true)).rejects.toThrow("busy");
    n = 0;
    await expect(withRetry(flaky, [0, 0], () => false)).rejects.toThrow("busy");
    expect(n).toBe(1);
  });
});

describe("runner", () => {
  it("rebuilds a cache written by an older engine version from the logs instead of trusting it", async () => {
    const { contract } = (
      await app.inject({
        method: "POST",
        url: "/contracts/compile",
        payload: { sentence: "out with Bea and Cy" },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: "/preflight",
      payload: { contractId: contract.id, snapshot: good },
    });
    await app.inject({ method: "POST", url: `/contracts/${contract.id}/activate` });
    await store.saveEngine(contract.id, {
      state: { ...(await import("@bathroombestie/engine")).initialState(contract), version: 1 },
      evSeq: 0,
      actSeq: 0,
    });
    await tick(store, clock);
    const row = await store.getEngine(contract.id);
    expect(row!.state.version).toBeGreaterThan(1);
  });
});
