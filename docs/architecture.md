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

## Decisions to confirm

- Times are integer epoch minutes everywhere.
- `Milestone.within` is a circle (where she should be by `by`). Milestones are parsed but unused until handoff benchmarks.
- Gemini fills a small `DraftPlan` rather than the full Contract; ids, thresholds and clock arithmetic are computed in code.
- `POST /preflight` takes `{contractId, snapshot}` so `activate` can check the stored report.
- "Apart from the group" for silence classification is the instantaneous check; the duration rule (cohesion) is stubbed.
- A silent person who is _together_ with the group is not classed unexplained; the score can still alert (TODO with cohesion).
- `engine_state` is a derived cache table (a 5th table beyond the four requested).
