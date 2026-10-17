import {
  thresholdsFor,
  type Alert,
  type EvidenceReport,
  type FriendAction,
  type PresetName,
  type ReadinessReport,
  type ScenarioFile,
} from "@bathroombestie/schema";
import {
  confidenceOfNormal,
  preflight,
  replay,
  separatedFor,
  type EngineState,
} from "@bathroombestie/engine";

export interface RunResult {
  alerts: Alert[];
  state: EngineState;
  readiness: ReadinessReport | null;
  /** Per-minute confidence of normal for each member (for the replay console). */
  trace: { t: number; n: Record<string, number> }[];
}

/** Replays a scenario from its logs, minute by minute, with an injected clock. Optionally swaps the preset. */
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

  const trace: RunResult["trace"] = [];
  const { state, alerts } = replay({
    contract,
    evidence,
    actions,
    to: start + sc.durationMin,
    onTick: (now, st) =>
      trace.push({
        t: now - start,
        n: Object.fromEntries(
          contract.group.members.map((id) => [
            id,
            Math.round(
              confidenceOfNormal(contract, st.people[id]!, now, separatedFor(contract, st, id, now))
                .n * 1000,
            ) / 1000,
          ]),
        ),
      }),
  });
  return { alerts, state, readiness, trace };
}
