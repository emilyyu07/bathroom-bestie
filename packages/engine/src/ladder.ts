import { SEVERITY, type Concern } from "./concerns";
import type { Ctx, Emit } from "./ctx";
import { resolveIncident } from "./incidents";
import type { Incident } from "./state";

/**
 * Advance one open incident given this tick's concern (null = nothing wrong right now).
 * Rung 1 nudge to her -> 2 watcher -> 3 next person -> 3 whole group, one step per ack_timeout.
 * Only a human (a watcher's worry) reaches rung 4. "Ack" is a friend's confirm/worry, handled in actions.ts.
 */
export function stepIncident(ctx: Ctx, open: Incident, concern: Concern | null, emit: Emit): void {
  const { contract, state, now } = ctx;
  const p = state.people[open.personId]!;

  if (open.kind === "friend_worry") {
    // A human report ends by human action or arriving home; normal evidence does not close it.
  } else if (concern?.severity === "advisory" && concern.kind !== open.kind) {
    // The stronger concern has passed and only the advisory one remains: close it, don't keep climbing.
    resolveIncident(ctx, open, "evidence_returned");
    return;
  } else if (!concern) {
    // She went quiet while still apart (timer frozen): not a rejoin. Hold the nudge open so the
    // score or unexplained path can take it over without a cooldown getting in the way.
    if (open.kind === "separation" && p.apartSince !== null) return;
    resolveIncident(ctx, open, open.kind === "separation" ? "rejoined" : "evidence_returned");
    return;
  } else if (SEVERITY[open.kind] === "advisory" && concern.kind !== open.kind) {
    // Advisory AND now something else: upgrade in place; the ack timeout counts from here.
    open.kind = concern.kind;
    open.rungSince = now;
  }
  if (SEVERITY[open.kind] !== "hard") return; // advisory and notice incidents never escalate alone

  if (now - open.rungSince >= contract.thresholds.ack_timeout_min && open.rung < 4) {
    if (open.step === "self") Object.assign(open, { rung: 2, step: "watcher" });
    else if (open.step === "watcher") Object.assign(open, { rung: 3, step: "next" });
    else if (open.step === "next") Object.assign(open, { rung: 3, step: "group" });
    else return; // group: top of the automatic ladder; only a human reaches rung 4
    open.rungSince = now;
    emit(open);
  }
}
