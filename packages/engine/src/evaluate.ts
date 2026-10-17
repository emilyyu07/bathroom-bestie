import type { Alert, Contract, EvidenceReport, FriendAction } from "@bathroombestie/schema";
import { applyAction } from "./actions";
import { updateApart } from "./cohesion";
import { detectConcern } from "./concerns";
import type { Ctx, Emit } from "./ctx";
import { ingest } from "./ingest";
import { openFor, openIncident, resolveIncident } from "./incidents";
import { stepIncident } from "./ladder";
import { observe } from "./observe";
import { renderAlert } from "./render";
import { ENGINE_STATE_VERSION, type EngineState } from "./state";

export { watcherFor } from "./watchers";

export interface EvaluateInput {
  contract: Contract;
  state: EngineState;
  /** New evidence since the last evaluation (append-only log slice). Items after `now` are ignored. */
  evidence: EvidenceReport[];
  /** New friend actions since the last evaluation. */
  actions: FriendAction[];
  /** Injected clock, integer minutes. Call once per minute for exact timings. */
  now: number;
}

export interface EvaluateResult {
  state: EngineState;
  alerts: Alert[];
}

/** Stable time order: by `t`, ties by input order. */
const inOrder = <T extends { t: number }>(
  xs: T[],
  now: number,
  keep: (x: T) => boolean = () => true,
) =>
  xs
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.t <= now && keep(x))
    .sort((a, b) => a.x.t - b.x.t || a.i - b.i)
    .map(({ x }) => x);

/**
 * The engine: a pure function of (contract, state, evidence, actions, now). Never reads a clock.
 * Per tick: ingest evidence -> apply friend actions -> for each member, observe, detect a concern,
 * and step that person's incident on the ladder.
 */
export function evaluate(input: EvaluateInput): EvaluateResult {
  const { contract, now } = input;
  if (input.state.version !== ENGINE_STATE_VERSION) {
    throw new Error(
      `engine state is version ${input.state.version}, expected ${ENGINE_STATE_VERSION}: call rebuild()`,
    );
  }
  const state: EngineState = structuredClone(input.state);
  const ctx: Ctx = { contract, state, now };
  const alerts: Alert[] = [];
  const members = new Set(contract.group.members);

  const emit: Emit = (inc, opts) => {
    const a = renderAlert(ctx, inc, alerts.length + state.incidents.length * 100, opts);
    alerts.push(a);
    return a;
  };

  // 1. Evidence.
  for (const e of inOrder(
    input.evidence,
    now,
    (e) => e.contractId === contract.id && members.has(e.personId),
  ))
    ingest(contract, state, e);

  // 2. Friend actions.
  for (const a of inOrder(input.actions, now)) applyAction(ctx, a, emit);

  // 3. Per-person ladder driven by evidence.
  const active = now >= contract.window.start && now <= contract.expires;
  for (const id of contract.group.members) {
    const p = state.people[id]!;
    updateApart(contract, state, id, now);
    const open = openFor(ctx, id);
    if (p.home) {
      if (open) resolveIncident(ctx, open, "home");
      continue;
    }
    if (!active) continue;

    const concern = detectConcern(ctx, id, observe(ctx, id));
    if (!open) {
      if (concern && (p.cooldownUntil === null || now >= p.cooldownUntil)) {
        emit(openIncident(ctx, id, concern.kind, 1, "self"));
      }
      continue;
    }
    stepIncident(ctx, open, concern, emit);
  }

  state.lastEvalAt = now;
  return { state, alerts };
}
