import { ENGINE_STATE_VERSION, evaluate, initialState, rebuild } from "@bathroombestie/engine";
import type { Clock } from "./clock";
import type { Store } from "./store";

/**
 * Per-minute engine runner. Folds new evidence/actions into the cached engine state one minute
 * at a time (so a missed tick catches up with exact timings) and stores any alerts.
 * `now` comes from the injected clock, never from Date.
 */
export async function tick(store: Store, clock: Clock): Promise<number> {
  const now = clock.nowMinute();
  let emitted = 0;
  for (const contract of await store.listActive()) {
    let row = (await store.getEngine(contract.id)) ?? {
      state: initialState(contract),
      evSeq: 0,
      actSeq: 0,
    };
    if (row.state.version !== ENGINE_STATE_VERSION) {
      // The cache came from an older engine. State is derived (invariant 2): rebuild it from the
      // append-only logs. Past minutes emit no new alerts; already-stored alerts are left alone.
      const allEv = await store.evidenceAfter(contract.id, 0, now);
      const allAct = await store.actionsAfter(contract.id, 0, now);
      row = {
        state: rebuild({
          contract,
          evidence: allEv.map((x) => x.e),
          actions: allAct.map((x) => x.a),
          to: now,
        }),
        evSeq: Math.max(0, ...allEv.map((x) => x.seq)),
        actSeq: Math.max(0, ...allAct.map((x) => x.seq)),
      };
      await store.saveEngine(contract.id, row);
      continue;
    }
    const evs = await store.evidenceAfter(contract.id, row.evSeq, now);
    const acts = await store.actionsAfter(contract.id, row.actSeq, now);
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
