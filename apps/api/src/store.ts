import type {
  Alert,
  Contract,
  EvidenceReport,
  FriendAction,
  ReadinessReport,
} from "@bathroombestie/schema";
import type { EngineState } from "@bathroombestie/engine";

export interface StoredContract {
  contract: Contract;
  status: "draft" | "active";
  readiness: ReadinessReport | null;
}
export interface EngineRow {
  state: EngineState;
  evSeq: number;
  actSeq: number;
}

export interface Store {
  saveContract(c: Contract): Promise<void>;
  getContract(id: string): Promise<StoredContract | null>;
  setReadiness(id: string, r: ReadinessReport): Promise<void>;
  activate(id: string): Promise<void>;
  listActive(): Promise<Contract[]>;
  addEvidence(e: EvidenceReport): Promise<void>;
  addAction(contractId: string, a: FriendAction): Promise<void>;
  /** Rows after `seq`, in seq order, including ones whose `t` is still in the future. */
  evidenceAfter(contractId: string, seq: number): Promise<{ seq: number; e: EvidenceReport }[]>;
  actionsAfter(contractId: string, seq: number): Promise<{ seq: number; a: FriendAction }[]>;
  getEngine(contractId: string): Promise<EngineRow | null>;
  saveEngine(contractId: string, row: EngineRow): Promise<void>;
  addAlerts(alerts: Alert[]): Promise<void>;
  listAlerts(contractId?: string): Promise<Alert[]>;
}

/** In-memory store for tests and offline demos. */
export class MemoryStore implements Store {
  contracts = new Map<string, StoredContract>();
  evidence: { seq: number; contractId: string; e: EvidenceReport }[] = [];
  actions: { seq: number; contractId: string; a: FriendAction }[] = [];
  engine = new Map<string, EngineRow>();
  alerts: Alert[] = [];
  private seq = 0;

  async saveContract(c: Contract) {
    this.contracts.set(c.id, { contract: c, status: "draft", readiness: null });
  }
  async getContract(id: string) {
    return this.contracts.get(id) ?? null;
  }
  async setReadiness(id: string, r: ReadinessReport) {
    this.contracts.get(id)!.readiness = r;
  }
  async activate(id: string) {
    this.contracts.get(id)!.status = "active";
  }
  async listActive() {
    return [...this.contracts.values()].filter((c) => c.status === "active").map((c) => c.contract);
  }
  async addEvidence(e: EvidenceReport) {
    this.evidence.push({ seq: ++this.seq, contractId: e.contractId, e });
  }
  async addAction(contractId: string, a: FriendAction) {
    this.actions.push({ seq: ++this.seq, contractId, a });
  }
  async evidenceAfter(contractId: string, seq: number) {
    return this.evidence.filter((r) => r.contractId === contractId && r.seq > seq);
  }
  async actionsAfter(contractId: string, seq: number) {
    return this.actions.filter((r) => r.contractId === contractId && r.seq > seq);
  }
  async getEngine(contractId: string) {
    return this.engine.get(contractId) ?? null;
  }
  async saveEngine(contractId: string, row: EngineRow) {
    this.engine.set(contractId, row);
  }
  async addAlerts(alerts: Alert[]) {
    this.alerts.push(...alerts);
  }
  async listAlerts(contractId?: string) {
    return this.alerts.filter((a) => !contractId || a.contractId === contractId);
  }
}
