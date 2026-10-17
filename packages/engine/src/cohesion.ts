import { distanceM, type Contract } from "@bathroombestie/schema";
import type { EngineState } from "./state";

/**
 * Group cohesion. "Separated" = farther than thresholds.separation_m from every other member
 * for thresholds.separation_min. Three rules keep it honest:
 *  - only *fresh* peers count (reported within silence_min); with nobody fresh we cannot tell,
 *    so she is not separated;
 *  - the timer (`apartSince`) only moves while she herself is fresh, and is frozen when she goes
 *    quiet, so "how long was she apart before the phone went dark" stays answerable;
 *  - a one-person group is never separated.
 */

/** Has this person reported recently enough, with a trustworthy location, to compare against? */
export const isFresh = (
  contract: Contract,
  state: EngineState,
  id: string,
  now: number,
): boolean => {
  const p = state.people[id];
  return (
    !!p &&
    !p.permissionLost &&
    !p.home &&
    p.lastArea !== null &&
    p.lastReportAt !== null &&
    now - p.lastReportAt < contract.thresholds.silence_min
  );
};

/** Instantaneous: farther than separation_m from every fresh peer (and at least one peer is fresh). */
export const isApart = (
  contract: Contract,
  state: EngineState,
  id: string,
  now: number,
): boolean => {
  const me = state.people[id]?.lastArea;
  if (!me) return false;
  const peers = contract.group.members.filter((m) => m !== id && isFresh(contract, state, m, now));
  if (peers.length === 0) return false;
  return peers.every(
    (o) => distanceM(me, state.people[o]!.lastArea!) > contract.thresholds.separation_m,
  );
};

/** Advance `apartSince` for one person. Mutates the (already cloned) state. */
export const updateApart = (
  contract: Contract,
  state: EngineState,
  id: string,
  now: number,
): void => {
  const p = state.people[id]!;
  if (p.home) {
    p.apartSince = null;
    return;
  }
  if (!isFresh(contract, state, id, now)) return; // frozen while she is quiet
  if (isApart(contract, state, id, now)) p.apartSince ??= now;
  else p.apartSince = null;
};

/** Minutes apart; if she has gone quiet, measured up to her last report. 0 if together. */
export const separatedFor = (
  contract: Contract,
  state: EngineState,
  id: string,
  now: number,
): number => {
  const p = state.people[id]!;
  if (p.apartSince === null) return 0;
  const end = isFresh(contract, state, id, now) ? now : (p.lastReportAt ?? now);
  return Math.max(0, end - p.apartSince);
};

/** Had she already been apart for separation_min when her last report arrived? */
export const wasSeparatedAtLastReport = (
  contract: Contract,
  state: EngineState,
  id: string,
): boolean => {
  const p = state.people[id]!;
  if (p.apartSince === null || p.lastReportAt === null) return false;
  return p.lastReportAt - p.apartSince >= contract.thresholds.separation_min;
};
