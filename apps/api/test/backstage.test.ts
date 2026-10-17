import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock";
import type { Backstage } from "../src/backstage";
import { MockCompiler } from "../src/compile";
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

describe("GET /contracts/:id/backstage", () => {
  it("404 for an unknown night", async () => {
    expect((await app.inject({ url: "/contracts/c_nope/backstage" })).statusCode).toBe(404);
  });

  it("works before anything has happened: nobody reporting, nobody joined", async () => {
    const c = await compile();
    const b = (await app.inject({ url: `/contracts/${c.contract.id}/backstage` })).json();
    expect(b).toMatchObject({
      status: "draft",
      demo: true,
      owner: "ana",
      incidents: [],
      alerts: [],
    });
    expect(
      b.members.map((m: { id: string; view: string; joined: boolean | null }) => [
        m.id,
        m.view,
        m.joined,
      ]),
    ).toEqual([
      ["ana", "not_reporting", null],
      ["bea", "not_reporting", false],
      ["cy", "not_reporting", false],
    ]);
  });

  it("follows the demo story: who reports, who is alone, the rung, who was told", async () => {
    const c = await compile();
    const id = c.contract.id as string;
    const found = await findNight(call, c.joinCode);
    const friends = playFriends({ call, now: () => clock.nowMinute(), found, at: BAR });
    await friends.join();
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
    await call("POST", "/preflight", { contractId: id, snapshot: snap });
    await call("POST", `/contracts/${id}/activate`, {});
    const step = async (away: boolean) => {
      clock.t += 1;
      await friends.report();
      await call("POST", "/evidence", {
        personId: "ana",
        contractId: id,
        t: clock.nowMinute(),
        area: away ? AWAY : BAR,
        motion: "walking",
        batteryPct: 70,
        charging: false,
        permissionOk: true,
      });
      await tick(store, clock);
    };
    const backstage = async () =>
      (await call("GET", `/contracts/${id}/backstage`)).json as Backstage;

    for (let m = 1; m <= 4; m++) await step(false);
    let b = await backstage();
    expect(b.status).toBe("active");
    expect(b.members.map((m) => [m.id, m.view, m.joined])).toEqual([
      ["ana", "reporting", null],
      ["bea", "reporting", true],
      ["cy", "reporting", true],
    ]);
    expect(b.incidents).toEqual([]);
    expect(b.members.find((m) => m.watchingNow)!.id).toBe("bea"); // the first watch slot

    for (let m = 5; m <= 10; m++) await step(true); // she left at +5; the watcher is told at +10
    b = await backstage();
    expect(b.incidents).toHaveLength(1);
    expect(b.incidents[0]).toMatchObject({
      personId: "ana",
      kind: "exit_alone",
      rung: 2,
      status: "open",
    });
    expect(b.members.find((m) => m.id === "ana")!.leftAloneMin).toBeGreaterThanOrEqual(3);
    expect(b.alerts.map((a) => [a.t - START, a.rung, a.kind, a.to])).toEqual([
      [7, 1, "separation", ["ana"]],
      [10, 2, "exit_alone", ["bea"]],
    ]);

    // Bea says she is with her: resolved, and the view says who said so.
    await friends.confirm("bea");
    await step(true);
    await step(true);
    b = await backstage();
    expect(b.incidents[0]).toMatchObject({
      status: "resolved",
      resolution: "confirmed",
      confirmedBy: "bea",
    });

    // Invariant: no location of any kind in the presenter view, however deeply it is nested.
    const keys = (v: unknown): string[] =>
      v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : [];
    for (const k of ["lat", "lon", "area", "lastKnown", "lastArea", "center"])
      expect(keys(b)).not.toContain(k);
    expect(JSON.stringify(b)).not.toMatch(/43\.6\d|-79\.3\d/); // no coordinate-looking numbers
  });
});
