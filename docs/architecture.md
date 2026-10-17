# Architecture

```
phones --POST /evidence--> API (round to ~100 m) --> evidence hypertable (append-only)
friends --POST /actions--> API ------------------> actions (append-only)
runner (every minute, injected clock) --> evaluate(contract, state, new evidence, new actions, now)
                                          --> engine_state cache + incidents (alerts)
console / friends read GET /incidents
Gemini: only POST /contracts/compile (sentence -> DraftPlan -> deterministic buildContract)
```

## Engine (`packages/engine`)

`evaluate` is pure. State is a JSON value carried between calls and is always rebuildable by folding the logs.
Call it once per minute for exact timings (the low-confidence dip is tracked tick by tick).

Confidence of normal: `N = exp(-sum w_i * max(0, (t - t_i)/tau_i - 1))` over corridor presence, movement and report
freshness. Weights and taus are in `contract.confidence`.

Silence classes: permission revoked -> evidence lost (rung 1 notify, never escalates); battery <= 5% and falling ->
soft note, no alert; battery > 20% and apart from the group -> unexplained stop; otherwise only the score can trigger.

Ladder (per ack timeout): 1 nudge to her -> 2 current watcher -> 3 next person -> 3 whole group. Rung 4 is reached only by
a human: a `worry` from the current watcher. Evidence returning resolves from
any rung; resolve and confirm start a 30 min cooldown. A `worry` incident is not closed by normal evidence, only by a
confirm or the home event.

## Engine layout (`packages/engine/src`)

`evaluate.ts` is a thin orchestrator: ingest evidence → apply friend actions → per member `observe` → `detectConcern` →
`stepIncident`.

- `ingest.ts` folds evidence into per-person state. `actions.ts` applies confirm/worry. `observe.ts` is the only step that
  updates tick-level tracking (score dip timer, soft notes).
- `concerns.ts`: detectors in priority order (`DETECTORS`), each a read-only function over the tick's `Signals`. A
  detector returns a `Concern {kind, severity}`; `SEVERITY` is only each kind's default. Severity is **stored on the
  incident** (hard / advisory / notice), so one kind can be advisory while she is reachable and hard once she is quiet.
  Ladder rule: only a hard concern upgrades an advisory incident (kind and/or severity, ack timeout restarts); two
  advisories never swap places; an advisory-only tick closes a stronger open incident. New concerns (e.g. overdue handoffs) are added here, not in the loop.
- `ladder.ts`: resolve / upgrade-in-place / escalate for one open incident. `incidents.ts`: open, resolve, cooldown.
- `render.ts`: the only place an incident becomes alert text and recipients (fixed templates).
- `replay.ts`: `replay`/`rebuild` derive state and alerts purely from the logs. `EngineState.version`
  (`ENGINE_STATE_VERSION`) is checked by `evaluate`; the API runner rebuilds a stale cache instead of trusting it.
  Bump the version whenever state or incident semantics change.

## Cohesion (`packages/engine/src/cohesion.ts`)

`updateApart` runs for every member each tick and maintains `PersonState.apartSince`.

- _Apart_ = farther than `separation_m` from every **fresh** peer (reported within `silence_min`, location trusted).
  No fresh peers, or a one-person group, means "cannot tell" and she is not apart.
- The timer only moves while she herself is fresh; it **freezes** when she goes quiet, so the engine can still ask
  "had she been apart for `separation_min` before going dark?" (`wasSeparatedAtLastReport`).
- _Separated_ = apart for `separation_min`. On its own it opens a rung-1 `separation` incident (a nudge to her) that never
  escalates and closes as `rejoined`. If she then goes silent (unexplained, which now needs the duration rule) or the score
  drops, the same incident upgrades in place and the ack timeout counts from the upgrade.

Long separation also feeds the score: a fourth stream, `confidence.separation` (w 0.4, tau 60 min), costs nothing until
she has been apart longer than tau. Its penalty is **capped** (`cap` 0.4, so N stays above 0.67) so separation alone can
never cross any preset's score floor; it only tips the score when she is also quiet or out of the area. If the nudge is
open when she goes quiet while apart, it is held open (not resolved), so no cooldown delays the stronger concern. Closing a nudge as `rejoined` starts **no** cooldown (a second
wander-off is nudged again once its own timer completes); every other resolution still starts the 30 min cooldown.

**Known limit: rounding vs `separation_m`.** Locations are rounded to 0.001° (~111 m north–south, ~80 m east–west), so
apparent distances are quantized. People really within ~80 m are never flagged apart (tested); between ~80 m and the 150 m
threshold the flag can be a false positive, and real separations just over 150 m can look closer. Treat `separation_m` as
good to about one grid cell. Tightening it needs finer coordinates, which would conflict with invariant 5.

## Milestones and home tracking

- `Milestone` is a union: `{kind:"area", by, within}` or `{kind:"home", by}`, each with optional `who` (omitted = every
  member; compile writes `["me"]`). A home milestone means "the phone's home geofence must fire by `by`".
- A contract with a home milestone makes pre-flight's `home_geofence` check **blocking** (a warning otherwise), so home
  features are armed only on devices that can report arrival. Compile emits a home milestone only if she states a home time.
- New per-preset thresholds: `milestone_grace_min` (20/10/5) and `exit_alone_min` (60/45/30).
- `normalizeContract(raw)` parses a stored contract, filling thresholds added later from the contract's own preset.
- Guards: an area milestone needs a radius of at least 200 m (locations are rounded to ~110 m); `expires` must cover the
  window end and every `by + milestone_grace_min`, so a deadline the engine would stop watching before can't exist.
- **Engine (`milestones.ts`, `concerns.ts`).** `overdue()` = applicable (honouring `who`), unmet, and `now > by + grace`. A
  home milestone is met when the geofence fires (`p.home`); an area milestone when a report lands in its circle, even late
  (`PersonState.milestoneMet`). The `missed_milestone` detector is **advisory** (nudge to her) while she is reporting and
  **hard** once silent for `silence_min`: late AND quiet are two independent signals, so it climbs without waiting for the
  score path. A dying battery (battery death) still suppresses escalation.
- **Nudges that end on their own** (`separation`, `missed_milestone`) each know whether their situation still holds
  (`stillApplies`) and end as `rejoined` / `arrived`, which start no cooldown. If she rejoins but is still late, the
  separation nudge closes and the late-nudge opens on the next tick. While a separation nudge is open it holds the floor;
  the late-nudge is not shown alongside it.

## Open requests for `apps/*` (Person B)

1. `PgStore.getContract` / `listActive`: return `normalizeContract(row.body)` instead of the raw JSON.
2. Compile: `DraftPlan.home_by_hours` (optional). Prompt/mock: "home by"/"back by". `buildContract` adds
   `{id:"home", kind:"home", by: start + home_by_hours*60, who:[me]}` only when present.
3. `termsOf` copy: "A friend is alerted when your phone goes quiet after you'd been apart from the group, or when you're well
   past a time you planned to be home." (the current "after N min of unexplained silence" is out of date.)
4. Mobile pre-flight must report a real `homeGeofenceSet` (now blocking when a home time is set).
5. Mobile Status: drop the "I'm fine" TODO ("no check-ins"; returning evidence already clears a nudge).
6. After the scenario PRs merge, re-run `pnpm test:db` (it replays every scenario on Postgres).

## Decision log

- **No "I'm fine" button (agreed by both owners).** The product has no check-ins. Opening the app already sends an
  evidence report immediately, which clears silence and low-score nudges. Nudges the app cannot clear (separation, and later
  missed milestone) are worded as facts, never as instructions. The mobile Status screen shows "watching" only.

## Decisions to confirm

- Times are integer epoch minutes everywhere.
- `Milestone.within` is a circle (where she should be by `by`). Milestones are parsed but unused until handoff benchmarks.
- Gemini fills a small `DraftPlan` rather than the full Contract; ids, thresholds and clock arithmetic are computed in code.
- `POST /preflight` takes `{contractId, snapshot}` so `activate` can check the stored report.
- "Apart from the group" for silence classification is the instantaneous check; the duration rule (cohesion) is stubbed.
- A silent person who is _together_ with the group is not classed unexplained; the score can still alert (TODO with cohesion).
- `engine_state` is a derived cache table (a 5th table beyond the four requested).
