import pg from "pg";
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
    return row ? { contract: row.body, status: row.status, readiness: row.readiness } : null;
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
    return r.rows.map((x) => x.body as Contract);
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
        e.area.lat,
        e.area.lon,
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
        area: { lat: x.lat, lon: x.lon },
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
  async listAlerts(contractId?: string) {
    const r = contractId
      ? await this.pool.query("SELECT body FROM incidents WHERE contract_id = $1 ORDER BY t, id", [
          contractId,
        ])
      : await this.pool.query("SELECT body FROM incidents ORDER BY t, id");
    return r.rows.map((x) => x.body as Alert);
  }
}
