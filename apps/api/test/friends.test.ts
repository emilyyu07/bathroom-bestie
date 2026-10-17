import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_THRESHOLDS } from "@bathroombestie/schema";
import { FakeClock } from "../src/clock";
import { MockCompiler, termsOf } from "../src/compile";
import { findNight, playFriends, type Call } from "../src/friends";
import { tick } from "../src/runner";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";

const START = 1_000_000;
const BAR = { lat: 43.65, lon: -79.38 };
const AWAY = { lat: 43.66, lon: -79.38 };

let store: MemoryStore, clock: FakeClock, app: ReturnType<typeof buildServer>;
beforeEach(() => {
  store = new MemoryStore();
  clock = new FakeClock(START);
  app = buildServer({ store, clock, compiler: new MockCompiler(), demo: true });
});
const call: Call = async (method, path, body) => {
  const r = await app.inject({
    method,
    url: path,
    payload: method === "GET" ? undefined : (body as never),
  });
  return { status: r.statusCode, json: r.body ? r.json() : null };
};
const compile = async () =>
  (
    await app.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea and Cy for 5 hours, home by 4 hours", me: "Ana" },
    })
  ).json();

describe("demo nights", () => {
  it("get the shortened timers, say so, and keep them when a preset is picked", async () => {
    const c = await compile();
    expect(c.contract.demo).toBe(true);
    expect(c.contract.thresholds).toEqual(DEMO_THRESHOLDS);
    expect(c.terms[0]).toMatch(/^DEMO NIGHT/);
    const p = (
      await app.inject({
        method: "POST",
        url: `/contracts/${c.contract.id}/preset`,
        payload: { preset: "relaxed" },
      })
    ).json();
    expect(p.contract.preset).toBe("relaxed");
    expect(p.contract.thresholds).toEqual(DEMO_THRESHOLDS);
  });
  it("are not the default: a normal server compiles a normal night with no demo line", async () => {
    const normal = buildServer({ store, clock, compiler: new MockCompiler() });
    const c = (
      await normal.inject({
        method: "POST",
        url: "/contracts/compile",
        payload: { sentence: "Out with Bea for 5 hours" },
      })
    ).json();
    expect(c.contract.demo).toBeUndefined();
    expect(termsOf(c.contract).join(" ")).not.toMatch(/DEMO/);
  });
});

describe("friend driver on a demo night", () => {
  it("finds the night by join code or id, then plays the whole story in single-digit minutes", async () => {
    const c = await compile();
    const found = await findNight(call, c.joinCode);
    expect(found).toMatchObject({ contractId: c.contract.id, owner: "ana" });
    expect((await findNight(call, c.contract.id)).friends.map((f) => f.id)).toEqual(["bea", "cy"]);

    const friends = playFriends({ call, now: () => clock.nowMinute(), found, at: BAR });
    await friends.join();
    expect((await call("GET", `/contracts/${c.contract.id}/watchers`)).json).toEqual({
      watchers: [
        { id: "bea", accepted: true, reachable: true },
        { id: "cy", accepted: true, reachable: true },
      ],
    });
    const snap = {
      permissions: { backgroundLocation: true, notifications: true },
      battery: { level: 90, restricted: false, lowPowerMode: false },
      connectivityRttMs: 100,
      firstEvidenceAfterS: 5,
      watchers: [
        { id: "bea", accepted: true, reachable: true },
        { id: "cy", accepted: true, reachable: true },
      ],
      homeGeofenceSet: true,
      contractConfirmed: true,
    };
    await call("POST", "/preflight", { contractId: c.contract.id, snapshot: snap });
    expect((await call("POST", `/contracts/${c.contract.id}/activate`, {})).status).toBe(200);

    // Her phone (here, the test) reports at the bar for 4 minutes, then she walks away.
    const LEAVE = 4;
    for (let m = 1; m <= 12; m++) {
      clock.t += 1;
      await friends.report();
      await call("POST", "/evidence", {
        personId: "ana",
        contractId: c.contract.id,
        t: clock.nowMinute(),
        area: m > LEAVE ? AWAY : BAR,
        motion: "walking",
        batteryPct: 70,
        charging: false,
        permissionOk: true,
      });
      await tick(store, clock);
    }
    const alerts = (await call("GET", `/incidents?contractId=${c.contract.id}`)).json as {
      alerts: { t: number; rung: number; to: string[]; kind: string }[];
    };
    const rel = alerts.alerts.map((a) => ({
      at: a.t - START,
      rung: a.rung,
      to: a.to,
      kind: a.kind,
    }));
    // She leaves at +5 (her first report from away). Deterministic on the fake clock:
    expect(rel).toEqual([
      { at: 7, rung: 1, to: ["ana"], kind: "separation" }, // apart for separation_min = 2
      { at: 10, rung: 2, to: ["bea"], kind: "exit_alone" }, // alone for exit_alone_min = 3, past +5
      { at: 11, rung: 3, to: ["cy"], kind: "escalation" }, // one ack_timeout_min (1) later
      { at: 12, rung: 3, to: ["bea", "cy"], kind: "escalation" },
    ]);

    // Bea taps "I'm with her"; the incident resolves.
    await friends.confirm("bea");
    clock.t += 1;
    await friends.report();
    await tick(store, clock);
    clock.t += 1;
    await tick(store, clock);
    const state = (await store.getEngine(c.contract.id))!.state;
    expect(
      state.incidents.filter((i) => i.personId === "ana").every((i) => i.status === "resolved"),
    ).toBe(true);
  });
});
