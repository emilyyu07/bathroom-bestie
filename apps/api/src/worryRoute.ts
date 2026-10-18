import type { Contract, FriendAction } from "@bathroombestie/schema";
import { WORRY_RATE_LIMIT_MIN, watcherFor, type EngineState } from "@bathroombestie/engine";

/**
 * What a friend's "I'm worried" will do, so their phone can say exactly who hears about it.
 * Mirrors the engine's rules (actions.ts) using its own watcherFor and rate limit; the engine
 * remains the one that acts. Pure over its inputs.
 *
 *  - taking_over: they are watching her now, so it goes to the top rung, to them.
 *  - to_watcher: a new alert goes to `watcher` (then on up the ladder if nobody responds).
 *  - already_out: an alert about her is already at that rung or higher; this report is recorded
 *    and named in it, but nothing new is sent.
 *  - rate_limited: they reported her less than WORRY_RATE_LIMIT_MIN ago; not counted.
 *  - ignored: not a member, or about themselves.
 */
export type WorryOutcome =
  "taking_over" | "to_watcher" | "already_out" | "rate_limited" | "ignored";

export interface WorryRoute {
  outcome: WorryOutcome;
  watcher: string | null;
  limitMin: number;
}

export function worryRoute(
  contract: Contract,
  state: EngineState | null,
  prior: FriendAction[],
  a: FriendAction,
): WorryRoute {
  const watcher = watcherFor(contract, a.targetPersonId, a.t);
  const route = (outcome: WorryOutcome): WorryRoute => ({
    outcome,
    watcher,
    limitMin: WORRY_RATE_LIMIT_MIN,
  });
  const members = contract.group.members;
  if (!members.includes(a.by) || !members.includes(a.targetPersonId) || a.by === a.targetPersonId)
    return route("ignored");

  // The engine keeps the last *accepted* worry per friend: replay theirs in time order.
  let last: number | undefined;
  for (const w of prior
    .filter((x) => x.type === "worry" && x.by === a.by && x.targetPersonId === a.targetPersonId)
    .sort((x, y) => x.t - y.t))
    if (last === undefined || w.t - last >= WORRY_RATE_LIMIT_MIN) last = w.t;
  if (last !== undefined && a.t - last < WORRY_RATE_LIMIT_MIN) return route("rate_limited");

  if (watcher === a.by) return route("taking_over");
  const open = state?.incidents.find((i) => i.personId === a.targetPersonId && i.status === "open");
  return route(open && open.rung >= 2 ? "already_out" : "to_watcher");
}
