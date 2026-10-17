import { evaluate, initialState } from "@bathroombestie/engine";
import type { Clock } from "./clock";
import type { Store } from "./store";

/**
 * Per-minute engine runner. Folds new evidence/actions into the cached engine state one minute
 * at a time (so a missed tick catches up with exact timings) and stores any alerts.
 * `now` comes from the injected clock, never from Date.
 */
/**
 * Rows up to (not including) the first whose `t` is after `now`. The cursor only advances over
 * delivered rows, so a row is never skipped because a later-seq row was due first; it waits a tick.
 */
const readyPrefix = <R>(rows: R[], tOf: (r: R) => number, now: number) => {
  const i = rows.findIndex((r) => tOf(r) > now);
  return i < 0 ? rows : rows.slice(0, i);
};

export async function tick(store: Store, clock: Clock): Promise<number> {
  const now = clock.nowMinute();
  let emitted = 0;
  for (const contract of await store.listActive()) {
    const row = (await store.getEngine(contract.id)) ?? {
      state: initialState(contract),
      evSeq: 0,
      actSeq: 0,
    };
    const evs = readyPrefix(await store.evidenceAfter(contract.id, row.evSeq), (x) => x.e.t, now);
    const acts = readyPrefix(await store.actionsAfter(contract.id, row.actSeq), (x) => x.a.t, now);
    let state = row.state;
    const from = (state.lastEvalAt ?? now - 1) + 1;
    for (let m = from; m <= now; m++) {
      const r = evaluate({
        contract,
        state,
        // Each item is delivered once, at the first minute we evaluate at or after its time.
        evidence: evs.filter((x) => Math.max(from, x.e.t) === m).map((x) => x.e),
        actions: acts.filter((x) => Math.max(from, x.a.t) === m).map((x) => x.a),
        now: m,
      });
      state = r.state;
      if (r.alerts.length) await store.addAlerts(r.alerts);
      emitted += r.alerts.length;
    }
    await store.saveEngine(contract.id, {
      state,
      evSeq: Math.max(row.evSeq, ...evs.map((x) => x.seq)),
      actSeq: Math.max(row.actSeq, ...acts.map((x) => x.seq)),
    });
  }
  return emitted;
}

export function startRunner(store: Store, clock: Clock, everyMs = 60_000) {
  const h = setInterval(
    () => void tick(store, clock).catch((e) => console.error("tick failed", e)),
    everyMs,
  );
  return () => clearInterval(h);
}
