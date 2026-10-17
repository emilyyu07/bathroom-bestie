import {
  makeContract,
  type Contract,
  type EvidenceReport,
  type FriendAction,
} from "@tether/schema";
import { evaluate, initialState, type EngineState } from "../src";

export const ev = (
  personId: string,
  t: number,
  o: Partial<EvidenceReport> = {},
): EvidenceReport => ({
  personId,
  contractId: "c1",
  t,
  area: { lat: 43.65, lon: -79.38 },
  motion: "walking",
  batteryPct: 61,
  charging: false,
  permissionOk: true,
  ...o,
});

/** Evidence from everyone every `every` minutes, except `silent` people after `silentFrom`. */
export const run = (opts: {
  contract?: Contract;
  to: number;
  evidence: (t: number) => EvidenceReport[];
  actions?: FriendAction[];
}) => {
  const contract = opts.contract ?? makeContract();
  let state: EngineState = initialState(contract);
  const alerts = [];
  for (let t = 0; t <= opts.to; t++) {
    const r = evaluate({
      contract,
      state,
      evidence: opts.evidence(t),
      actions: (opts.actions ?? []).filter((a) => a.t === t),
      now: t,
    });
    state = r.state;
    alerts.push(...r.alerts);
  }
  return { state, alerts, contract };
};

/** Everyone reports every 5 min; `ana` goes dark after `darkFrom` at the given battery. */
export const darkAna =
  (darkFrom: number, battery = 61) =>
  (t: number) => {
    const out: EvidenceReport[] = [];
    if (t % 5 !== 0) return out;
    out.push(
      ev("bea", t, { area: { lat: 43.66, lon: -79.38 } }),
      ev("cy", t, { area: { lat: 43.66, lon: -79.38 } }),
    );
    if (t <= darkFrom) out.push(ev("ana", t, { batteryPct: battery }));
    return out;
  };
