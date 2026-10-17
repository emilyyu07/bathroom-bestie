import type { FriendAction } from "@bathroombestie/schema";
import type { Ctx, Emit } from "./ctx";
import { openFor, openIncident, resolveIncident } from "./incidents";
import { WORRY_RATE_LIMIT_MIN } from "./state";
import { watcherFor } from "./watchers";

/**
 * Apply one friend action (a human report, invariant 8). Every action is logged with its outcome.
 *  - confirm: resolves the person's open incident from any rung and starts the cooldown
 *  - worry: opens a rung-2 incident for the watcher even when evidence is normal; if the worrier
 *    is the current watcher, goes straight to rung-4 tools. One worry per friend per person per 15 min.
 */
export function applyAction(ctx: Ctx, a: FriendAction, emit: Emit): void {
  const { contract, state, now } = ctx;
  const log = (outcome: "applied" | "rate_limited" | "ignored") =>
    state.actionLog.push({
      t: a.t,
      type: a.type,
      by: a.by,
      targetPersonId: a.targetPersonId,
      reason: a.reason,
      outcome,
    });
  const target = state.people[a.targetPersonId];
  if (!target || !contract.group.members.includes(a.by) || a.by === a.targetPersonId) {
    log("ignored");
    return;
  }
  const open = openFor(ctx, a.targetPersonId);

  if (a.type === "confirm") {
    if (open) {
      resolveIncident(ctx, open, "confirmed", a.by);
      log("applied");
    } else log("ignored");
    return;
  }

  const last = target.worryAt[a.by];
  if (last !== undefined && a.t - last < WORRY_RATE_LIMIT_MIN) {
    log("rate_limited");
    return;
  }
  target.worryAt[a.by] = a.t;
  log("applied");
  const byWatcher = watcherFor(contract, a.targetPersonId, a.t) === a.by;

  if (open) {
    const rung = byWatcher ? 4 : (Math.max(open.rung, 2) as 2 | 3 | 4);
    if (rung > open.rung || byWatcher) {
      open.rung = rung;
      open.step = byWatcher ? "friend" : open.rung >= 3 ? open.step : "watcher";
      open.rungSince = now;
      open.raisedBy = a.by;
      open.reason = a.reason;
      emit(open, { attributed: true });
    }
    return;
  }
  const inc = openIncident(
    ctx,
    a.targetPersonId,
    { kind: "friend_worry", severity: "hard" }, // a human report always climbs
    byWatcher ? 4 : 2,
    byWatcher ? "friend" : "watcher",
    { raisedBy: a.by, reason: a.reason },
  );
  emit(inc, { attributed: true });
}
