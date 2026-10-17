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
  /** Replaces a draft contract's body and clears its readiness. False if missing or not a draft. */
  updateDraft(c: Contract): Promise<boolean>;
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
  /** Records that `personId` agreed to watch; repeat calls keep the first time. */
  acceptWatcher(contractId: string, personId: string, t: number): Promise<void>;
  acceptedWatchers(contractId: string): Promise<string[]>;
  /** Alerts for a contract, and/or only those addressed to one person (`to` includes them). */
  listAlerts(contractId?: string, to?: string): Promise<Alert[]>;
}

/** In-memory store for tests and offline demos. */
export class MemoryStore implements Store {
  contracts = new Map<string, StoredContract>();
  evidence: { seq: number; contractId: string; e: EvidenceReport }[] = [];
  actions: { seq: number; contractId: string; a: FriendAction }[] = [];
  engine = new Map<string, EngineRow>();
  alerts: Alert[] = [];
  watchers = new Map<string, Map<string, number>>();
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
  async updateDraft(c: Contract) {
    const s = this.contracts.get(c.id);
    if (s?.status !== "draft") return false;
    this.contracts.set(c.id, { contract: c, status: "draft", readiness: null });
    return true;
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
  async acceptWatcher(contractId: string, personId: string, t: number) {
    const m = this.watchers.get(contractId) ?? new Map<string, number>();
    if (!m.has(personId)) m.set(personId, t);
    this.watchers.set(contractId, m);
  }
  async acceptedWatchers(contractId: string) {
    return [...(this.watchers.get(contractId)?.keys() ?? [])];
  }
  async listAlerts(contractId?: string, to?: string) {
    return this.alerts.filter(
      (a) =>
        (!contractId || a.contractId === contractId) && (to === undefined || a.to.includes(to)),
    );
  }
}
