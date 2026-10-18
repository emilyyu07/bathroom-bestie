import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";

const make = (demo: boolean) =>
  buildServer({
    store: new MemoryStore(),
    clock: new FakeClock(1_000_000),
    compiler: new MockCompiler(),
    demo,
  });
const compile = (app: ReturnType<typeof make>, sentence: string) =>
  app.inject({ method: "POST", url: "/contracts/compile", payload: { sentence, me: "Ana" } });

describe("GET /demo/latest (demo mode only)", () => {
  let app: ReturnType<typeof make>;
  beforeEach(() => {
    app = make(true);
  });

  it("is 404 until someone has planned a night", async () => {
    const r = await app.inject({ url: "/demo/latest" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: "no_night_yet" });
  });

  it("returns the newest night's join code, owner, members and status", async () => {
    const c = (await compile(app, "Out with Cynthia, Bea and Dee for 5 hours")).json();
    const r = await app.inject({ url: "/demo/latest" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      contractId: c.contract.id,
      joinCode: c.joinCode,
      owner: "ana",
      members: ["ana", "cynthia", "bea", "dee"],
      status: "draft",
    });
  });

  it("follows the newest plan, and shows when the night goes active", async () => {
    await compile(app, "Out with Bea for 3 hours");
    const second = (await compile(app, "Out with Cynthia and Dee for 4 hours")).json();
    expect((await app.inject({ url: "/demo/latest" })).json().contractId).toBe(second.contract.id);
    // Activation needs a ready pre-flight; drive it the way the app does.
    const snap = {
      permissions: { backgroundLocation: true, notifications: true },
      battery: { level: 90, restricted: false, lowPowerMode: false },
      connectivityRttMs: 100,
      firstEvidenceAfterS: 5,
      watchers: [{ id: "cynthia", accepted: true, reachable: true }],
      homeGeofenceSet: true,
      contractConfirmed: true,
    };
    await app.inject({
      method: "POST",
      url: "/preflight",
      payload: { contractId: second.contract.id, snapshot: snap },
    });
    await app.inject({
      method: "POST",
      url: `/contracts/${second.contract.id}/activate`,
      payload: {},
    });
    expect((await app.inject({ url: "/demo/latest" })).json().status).toBe("active");
  });

  it("does not exist on a normal server", async () => {
    const normal = make(false);
    await compile(normal, "Out with Bea for 3 hours");
    expect((await normal.inject({ url: "/demo/latest" })).statusCode).toBe(404);
    expect((await normal.inject({ url: "/demo/latest" })).json().message).toMatch(/not found/i);
  });
});
