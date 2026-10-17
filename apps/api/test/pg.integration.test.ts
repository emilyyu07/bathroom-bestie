import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Alert, ReadinessSnapshot, ScenarioFile } from "@bathroombestie/schema";
import { loadScenarios } from "@bathroombestie/sim/src/scenarios";
import { runScenario } from "@bathroombestie/sim/src/runner";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { runMigrations } from "../src/migrations";
import { PgStore } from "../src/pgStore";
import { tick } from "../src/runner";
import { buildServer } from "../src/server";
import { MemoryStore, type Store } from "../src/store";

/**
 * Runs against a real Postgres/TimescaleDB (`pnpm test:db`). Skipped in plain `pnpm test`.
 * Uses its own database, created if missing, so dev data is never truncated.
 */
const url = process.env.DATABASE_URL_TEST;

const good: ReadinessSnapshot = {
  permissions: { backgroundLocation: true, notifications: true },
  battery: { level: 90, restricted: false, lowPowerMode: false },
  connectivityRttMs: 300,
  firstEvidenceAfterS: 10,
  watchers: [{ id: "bea", accepted: true, reachable: true }],
  homeGeofenceSet: true,
  contractConfirmed: true,
};

async function ensureDatabase(target: string) {
  const u = new URL(target);
  const name = u.pathname.slice(1);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }
}

/** Feeds a scenario into a store, then ticks the runner every `step` minutes to the end. */
async function replay(store: Store, sc: ScenarioFile, step: number): Promise<Alert[]> {
  const c = sc.contract;
  const start = c.window.start;
  await store.saveContract(c);
  await store.activate(c.id);
  for (const [personId, events] of Object.entries(sc.timelines))
    for (const e of events)
      await store.addEvidence({ ...e.evidence, personId, contractId: c.id, t: start + e.at });
  for (const { at, ...a } of sc.actions) await store.addAction(c.id, { ...a, t: start + at });
  const clock = new FakeClock(start);
  const end = start + sc.durationMin;
  for (;;) {
    await tick(store, clock);
    if (clock.t === end) break;
    clock.t = Math.min(end, clock.t + step);
  }
  return store.listAlerts(c.id);
}

describe.skipIf(!url)("postgres integration", () => {
  let pool: pg.Pool;
  let store: PgStore;

  beforeAll(async () => {
    await ensureDatabase(url!);
    pool = new pg.Pool({ connectionString: url });
    const client = await pool.connect();
    try {
      await runMigrations(client);
      expect(await runMigrations(client)).toEqual([]); // idempotent
    } finally {
      client.release();
    }
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE engine_state, incidents, actions, evidence, contracts");
    store = new PgStore(pool);
  });

  describe("http flow on PgStore", () => {
    let clock: FakeClock, app: ReturnType<typeof buildServer>;
    beforeEach(() => {
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

    it("stores the contract and gates activation on stored readiness", async () => {
      const { contract } = await compile();
      expect((await store.getContract(contract.id))?.contract).toEqual(contract);
      const act = () => app.inject({ method: "POST", url: `/contracts/${contract.id}/activate` });
      expect((await act()).statusCode).toBe(409);
      await app.inject({
        method: "POST",
        url: "/preflight",
        payload: { contractId: contract.id, snapshot: good },
      });
      expect((await act()).statusCode).toBe(200);
      expect((await store.listActive()).map((c) => c.id)).toEqual([contract.id]);
    });

    it("stores only the rounded area", async () => {
      const { contract } = await compile();
      await app.inject({
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
      const raw = await pool.query("SELECT lat, lon FROM evidence");
      expect(raw.rows).toEqual([{ lat: 43.653, lon: -79.384 }]);
    });

    it("runner turns a friend worry into a listed alert", async () => {
      const { contract } = await compile();
      await app.inject({
        method: "POST",
        url: "/preflight",
        payload: { contractId: contract.id, snapshot: good },
      });
      await app.inject({ method: "POST", url: `/contracts/${contract.id}/activate` });
      await tick(store, clock);
      clock.t += 5;
      await app.inject({
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
      await tick(store, clock);
      await tick(store, clock); // re-ticking the same minute must not duplicate alerts
      const list = (
        await app.inject({ method: "GET", url: `/incidents?contractId=${contract.id}` })
      ).json();
      expect(list.alerts).toHaveLength(1);
      expect(list.alerts[0]).toMatchObject({ rung: 2, raisedBy: "cy", personId: "me" });
    });
  });

  // Every scenario, through Postgres and the minute runner, must match the pure sim exactly,
  // whether the runner ticks every minute or catches up after missed ticks.
  const scenarios = loadScenarios().filter((sc) => sc.label.expect !== "activation_blocked");
  for (const sc of scenarios) {
    for (const step of [1, 7]) {
      it(`scenario ${sc.name} matches the sim (tick every ${step} min)`, async () => {
        const expected = runScenario(sc).alerts;
        const viaPg = await replay(store, sc, step);
        const viaMemory = await replay(new MemoryStore(), sc, step);
        expect(viaPg).toEqual(JSON.parse(JSON.stringify(expected)));
        expect(viaPg).toEqual(JSON.parse(JSON.stringify(viaMemory)));
      });
    }
  }
});
