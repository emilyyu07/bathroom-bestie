import {
  thresholdsFor,
  type Alert,
  type EvidenceReport,
  type FriendAction,
  type PresetName,
  type ReadinessReport,
  type ScenarioFile,
} from "@tether/schema";
import { confidenceOfNormal, evaluate, initialState, preflight, type EngineState } from "@tether/engine";

export interface RunResult {
  alerts: Alert[];
  state: EngineState;
  readiness: ReadinessReport | null;
  /** Per-minute confidence of normal for each member (for the replay console). */
  trace: { t: number; n: Record<string, number> }[];
}

/** Replays a scenario minute by minute with an injected clock. Optionally swaps the preset. */
export function runScenario(sc: ScenarioFile, preset?: PresetName): RunResult {
  const contract = preset
    ? { ...sc.contract, preset, thresholds: thresholdsFor(preset, sc.contract.thresholds) }
    : sc.contract;
  const start = contract.window.start;

  const readiness = sc.readiness ? preflight(sc.readiness, contract) : null;

  const evidence: EvidenceReport[] = Object.entries(sc.timelines).flatMap(([personId, events]) =>
    events.map((e) => ({ ...e.evidence, personId, contractId: contract.id, t: start + e.at })),
  );
  const actions: FriendAction[] = sc.actions.map(({ at, ...a }) => ({ ...a, t: start + at }));

  let state = initialState(contract);
  const alerts: Alert[] = [];
  const trace: RunResult["trace"] = [];
  for (let now = start; now <= start + sc.durationMin; now++) {
    const r = evaluate({
      contract,
      state,
      evidence: evidence.filter((e) => e.t === now),
      actions: actions.filter((a) => a.t === now),
      now,
    });
    state = r.state;
    alerts.push(...r.alerts);
    trace.push({
      t: now - start,
      n: Object.fromEntries(
        contract.group.members.map((id) => [id, Math.round(confidenceOfNormal(contract, state.people[id]!, now).n * 1000) / 1000]),
      ),
    });
  }
  return { alerts, state, readiness, trace };
}
