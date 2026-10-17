import pg from "pg";
import { normalizeContract } from "@bathroombestie/schema";
import type {
  Alert,
  Contract,
  EvidenceReport,
  FriendAction,
  ReadinessReport,
} from "@bathroombestie/schema";
import type { EngineRow, Store, StoredContract } from "./store";

/** Postgres/TimescaleDB store. Evidence is append-only; there is no UPDATE or DELETE on it. */
export class PgStore implements Store {
  constructor(private pool: pg.Pool) {}

  async saveContract(c: Contract) {
    await this.pool.query("INSERT INTO contracts (id, body) VALUES ($1, $2)", [c.id, c]);
  }
  async getContract(id: string): Promise<StoredContract | null> {
    const r = await this.pool.query("SELECT body, status, readiness FROM contracts WHERE id = $1", [
      id,
    ]);
    const row = r.rows[0];
    // Rows saved before a threshold existed get it from their own preset.
    return row
      ? { contract: normalizeContract(row.body), status: row.status, readiness: row.readiness }
      : null;
  }
  async findByIdPrefix(prefix: string) {
    // The caller passes a validated hex prefix, so there is no LIKE wildcard to escape.
    const r = await this.pool.query(
      "SELECT body, status, readiness FROM contracts WHERE id LIKE $1 ORDER BY id LIMIT 5",
      [`${prefix}%`],
    );
    return r.rows.map((row) => ({
      contract: normalizeContract(row.body),
      status: row.status,
      readiness: row.readiness,
    }));
  }
  async setReadiness(id: string, rep: ReadinessReport) {
    await this.pool.query("UPDATE contracts SET readiness = $2 WHERE id = $1", [id, rep]);
  }
  async updateDraft(c: Contract) {
    const r = await this.pool.query(
      "UPDATE contracts SET body = $2, readiness = NULL WHERE id = $1 AND status = 'draft'",
      [c.id, c],
    );
    return r.rowCount === 1;
  }
  async activate(id: string) {
    await this.pool.query("UPDATE contracts SET status = 'active' WHERE id = $1", [id]);
  }
  async listActive() {
    const r = await this.pool.query(
      "SELECT body FROM contracts WHERE status = 'active' ORDER BY id",
    );
    // One unreadable row must not stop the runner from watching every other night. If none can
    // be read, it is a bug rather than a bad row: fail loudly instead of watching nothing.
    let lastError: unknown;
    const out = r.rows.flatMap((x) => {
      try {
        return [normalizeContract(x.body)];
      } catch (e) {
        lastError = e;
        console.error("skipping unreadable contract", x.body?.id, e);
        return [];
      }
    });
    if (r.rows.length > 0 && out.length === 0) throw lastError;
    return out;
  }
  async addEvidence(e: EvidenceReport) {
    await this.pool.query(
      `INSERT INTO evidence (time, contract_id, person_id, t, lat, lon, motion, battery_pct, charging, permission_ok, home_arrived)
       VALUES (to_timestamp($4 * 60), $1, $2, $3, $5, $6, $7, $8, $9, $10, $11)`,
      [
        e.contractId,
        e.personId,
        e.t,
        e.t,
        e.area?.lat ?? null,
        e.area?.lon ?? null,
        e.motion,
        e.batteryPct,
        e.charging,
        e.permissionOk,
        e.homeArrived ?? null,
      ],
    );
  }
  async addAction(contractId: string, a: FriendAction) {
    await this.pool.query(
      "INSERT INTO actions (contract_id, type, by, target, t, reason) VALUES ($1, $2, $3, $4, $5, $6)",
      [contractId, a.type, a.by, a.targetPersonId, a.t, a.reason ?? null],
    );
  }
  async evidenceAfter(contractId: string, seq: number) {
    const r = await this.pool.query(
      "SELECT * FROM evidence WHERE contract_id = $1 AND seq > $2 ORDER BY seq",
      [contractId, seq],
    );
    return r.rows.map((x) => ({
      seq: Number(x.seq),
      e: {
        personId: x.person_id,
        contractId: x.contract_id,
        t: x.t,
        ...(x.lat === null || x.lon === null ? {} : { area: { lat: x.lat, lon: x.lon } }),
        motion: x.motion,
        batteryPct: x.battery_pct,
        charging: x.charging,
        permissionOk: x.permission_ok,
        ...(x.home_arrived === null ? {} : { homeArrived: x.home_arrived }),
      } satisfies EvidenceReport,
    }));
  }
  async actionsAfter(contractId: string, seq: number) {
    const r = await this.pool.query(
      "SELECT * FROM actions WHERE contract_id = $1 AND seq > $2 ORDER BY seq",
      [contractId, seq],
    );
    return r.rows.map((x) => ({
      seq: Number(x.seq),
      a: {
        type: x.type,
        by: x.by,
        targetPersonId: x.target,
        t: x.t,
        ...(x.reason ? { reason: x.reason } : {}),
      } as FriendAction,
    }));
  }
  async getEngine(contractId: string): Promise<EngineRow | null> {
    const r = await this.pool.query(
      "SELECT state, ev_seq, act_seq FROM engine_state WHERE contract_id = $1",
      [contractId],
    );
    const x = r.rows[0];
    return x ? { state: x.state, evSeq: Number(x.ev_seq), actSeq: Number(x.act_seq) } : null;
  }
  async saveEngine(contractId: string, row: EngineRow) {
    await this.pool.query(
      `INSERT INTO engine_state (contract_id, state, ev_seq, act_seq) VALUES ($1, $2, $3, $4)
       ON CONFLICT (contract_id) DO UPDATE SET state = $2, ev_seq = $3, act_seq = $4`,
      [contractId, row.state, row.evSeq, row.actSeq],
    );
  }
  async addAlerts(alerts: Alert[]) {
    for (const a of alerts) {
      await this.pool.query(
        "INSERT INTO incidents (id, contract_id, incident_id, rung, person_id, t, body) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
        [a.id, a.contractId, a.incidentId, a.rung, a.personId, a.t, a],
      );
    }
  }
  async acceptWatcher(contractId: string, personId: string, t: number) {
    await this.pool.query(
      "INSERT INTO watchers (contract_id, person_id, accepted_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [contractId, personId, t],
    );
  }
  async acceptedWatchers(contractId: string) {
    const r = await this.pool.query(
      "SELECT person_id FROM watchers WHERE contract_id = $1 ORDER BY accepted_at, person_id",
      [contractId],
    );
    return r.rows.map((x) => x.person_id as string);
  }
  async listAlerts(contractId?: string, to?: string) {
    const where: string[] = [];
    const args: string[] = [];
    if (contractId !== undefined) {
      args.push(contractId);
      where.push(`contract_id = $${args.length}`);
    }
    if (to !== undefined) {
      // `to` is a JSON array of person ids inside the stored alert.
      args.push(to);
      where.push(`body->'to' @> to_jsonb($${args.length}::text)`);
    }
    const r = await this.pool.query(
      `SELECT body FROM incidents ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY t, id`,
      args,
    );
    return r.rows.map((x) => x.body as Alert);
  }
}
