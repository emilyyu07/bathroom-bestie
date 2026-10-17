import {
  makeContract,
  type Contract,
  type EvidenceReport,
  type FriendAction,
} from "@bathroombestie/schema";
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

const A = { lat: 43.65, lon: -79.38 };
const FAR = { lat: 43.66, lon: -79.38 }; // ~1.1 km from A, beyond separation_m (150)

/**
 * Everyone reports every 5 min; bea and cy stay at A. `ana` is with them until `apartFrom`
 * (default: never), then ~1.1 km away, and stops reporting after `darkFrom`.
 */
export const darkAna =
  (darkFrom: number, battery = 61, apartFrom = Infinity) =>
  (t: number) => {
    const out: EvidenceReport[] = [];
    if (t % 5 !== 0) return out;
    out.push(ev("bea", t, { area: A }), ev("cy", t, { area: A }));
    if (t <= darkFrom)
      out.push(ev("ana", t, { batteryPct: battery, area: t >= apartFrom ? FAR : A }));
    return out;
  };
