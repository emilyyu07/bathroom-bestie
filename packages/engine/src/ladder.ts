import type { Concern } from "./concerns";
import type { Ctx, Emit } from "./ctx";
import { resolveIncident } from "./incidents";
import { overdue } from "./milestones";
import type { Incident, IncidentKind } from "./state";

/** Does the situation this incident is about still hold? Only the nudge kinds can end on their own. */
const stillApplies = (ctx: Ctx, inc: Incident): boolean => {
  const p = ctx.state.people[inc.personId]!;
  switch (inc.kind) {
    case "separation":
      return p.apartSince !== null;
    case "missed_milestone":
      return overdue(ctx.contract, p, inc.personId, ctx.now).length > 0;
    default:
      return true;
  }
};

/** How a nudge ends when its own situation is over. These start no cooldown (see resolveIncident). */
const endedBy = (kind: IncidentKind) =>
  kind === "separation"
    ? "rejoined"
    : kind === "missed_milestone"
      ? "arrived"
      : "evidence_returned";

/**
 * Advance one open incident given this tick's concern (null = nothing wrong right now).
 * Rung 1 nudge to her -> 2 watcher -> 3 next person -> 3 whole group, one step per ack_timeout.
 * Only a human (a watcher's worry) reaches rung 4. "Ack" is a friend's confirm/worry, handled in actions.ts.
 */
export function stepIncident(ctx: Ctx, open: Incident, concern: Concern | null, emit: Emit): void {
  const { contract, now } = ctx;

  if (open.kind === "friend_worry") {
    // A human report ends by human action or arriving home; normal evidence does not close it.
  } else if (!concern) {
    // Quiet while her situation still holds (e.g. apart, timer frozen; or still overdue): not over.
    // Hold the nudge so the score / unexplained path can take it over with no cooldown in the way.
    const applies = stillApplies(ctx, open);
    if (open.severity === "advisory" && applies) return;
    resolveIncident(ctx, open, applies ? "evidence_returned" : endedBy(open.kind));
    return;
  } else if (concern.severity === "advisory") {
    // Only a nudge-level concern is left this tick.
    //  - Open incident is stronger: that concern has passed, close it rather than keep climbing.
    //  - Open incident is itself advisory: leave it be (two advisories never swap places) unless
    //    its own situation has ended, in which case close it so the other nudge opens next tick.
    if (open.severity !== "advisory") resolveIncident(ctx, open, "evidence_returned");
    else if (!stillApplies(ctx, open)) resolveIncident(ctx, open, endedBy(open.kind));
    return;
  } else if (open.severity === "advisory") {
    // Advisory AND now a harder concern: upgrade in place (new kind and/or a harder severity of the
    // same kind). The ack timeout counts from here.
    open.kind = concern.kind;
    open.severity = concern.severity;
    open.rungSince = now;
  }
  if (open.severity !== "hard") return; // advisory and notice incidents never escalate alone

  if (now - open.rungSince >= contract.thresholds.ack_timeout_min && open.rung < 4) {
    if (open.step === "self") Object.assign(open, { rung: 2, step: "watcher" });
    else if (open.step === "watcher") Object.assign(open, { rung: 3, step: "next" });
    else if (open.step === "next") Object.assign(open, { rung: 3, step: "group" });
    else return; // group: top of the automatic ladder; only a human reaches rung 4
    open.rungSince = now;
    emit(open);
  }
}
