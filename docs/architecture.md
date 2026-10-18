# Architecture

BathroomBestie is an autonomous safety net for a night out. It is built for the Kaze challenge (Hack the Valley 11,
healthcare and wellbeing track): _help should be initiated when someone can no longer initiate it_, without trying to
determine what happened to her. `CLAUDE.md` holds the non-negotiable invariants; `docs/scope.md` is meant to be the
source of truth for scope but is still a placeholder (see "Open items").

## 1. Design stance

- **Behavior, not condition.** The system never detects drugging, intoxication or health. It watches whether her phone
  behaves like a normal night: reporting, in the planned area, with the group, home when she said. A departure from
  normal is surfaced as an observable fact ("hasn't sent an update for 20 min"), never as a diagnosis.
- **Absence is the signal.** She does nothing during the night. There are no check-ins, no panic button and no live
  location sharing. Silence, leaving the group alone, or being late home is what escalates.
- **People make the calls.** Alerts climb a ladder of named friends. A friend can say "I'm with her" or "I'm worried".
  Nothing contacts an authority; a friend may be shown a pre-filled script as text.
- **Deterministic and explainable.** The decision engine is a pure function, so every alert can be replayed from the
  logs, and every threshold is data in a contract she confirmed.
- **Privacy by construction.** Locations are coarse (~100 m), home never leaves her phone, and the presenter view
  carries no position at all.

## 2. System overview

```
phones --POST /evidence--> API (zod rounds to ~100 m; an arrival's area is dropped) --> evidence (append-only)
friends --POST /actions--> API ----------------------------------------------------> actions  (append-only)
runner (every 60 s, injected clock)
   --> evaluate(contract, cached state, new evidence, new actions, now)
   --> engine_state (derived cache) + incidents (alerts)
her phone and friends' phones poll GET /incidents?contractId=&to=<me>      (no push delivery)
Gemini: only POST /contracts/compile (sentence -> DraftPlan -> deterministic buildContract)
```

| Package / app     | Role                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/schema` | zod types: Contract, Evidence, FriendAction, Alert, Readiness, Scenario; presets as data                                                                                                |
| `packages/engine` | pure `evaluate`, `preflight`, `replay`/`rebuild`; no I/O, no clock                                                                                                                      |
| `packages/sim`    | 14 scenario files, runner, judge, sweep, replay export (drives the same engine)                                                                                                         |
| `apps/api`        | Fastify routes, per-minute runner, Postgres/TimescaleDB and in-memory stores, Gemini compile                                                                                            |
| `apps/console`    | Vite page: confidence-of-normal curves with alerts, and the false-alarm vs speed chart                                                                                                  |
| `apps/mobile`     | Expo / React Native app (planner and friend roles). Outside the pnpm workspace: Metro and pnpm's symlinked layout do not mix, so it installs separately and mirrors a few types by hand |

The engine depends only on the schema. That is why the API, the simulator and the tests can all drive identical code.

## 3. Invariants and where they are enforced

| #   | Invariant                                       | Enforcement                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Engine is pure; `now` is an argument            | No `Date` in any `packages/*/src`. Only `apps/api/src/clock.ts` reads the wall clock (`systemClock`; `FakeClock` for tests and demos)                                                                                                                              |
| 2   | Evidence and actions append-only; state derived | `replay`/`rebuild` fold the logs; the runner rebuilds a stale cache. In Postgres this is a convention (no UPDATE/DELETE issued), not a trigger                                                                                                                     |
| 3   | Gemini only at setup                            | Imported only in `apps/api/src/compile.ts`. Alert text comes from `templates.ts`                                                                                                                                                                                   |
| 4   | Never call 911                                  | The rung-4 script is a string shown as text; nothing dials                                                                                                                                                                                                         |
| 5   | ~100 m rounding; home on device                 | Phone rounds, `RoundedArea` rounds again on parse, an arrival's area is dropped by the API, and a DB CHECK allows a missing location only for an arrival                                                                                                           |
| 6   | Observable wording, banned words                | A test scans every template, factor and reason string; the model's read-back is checked against the same list                                                                                                                                                      |
| 7   | Thresholds are contract data                    | Presets, report cadence, demo timers and the confidence model live in the contract. **Exceptions still in code:** cooldown (30 min) and worry rate limit (15 min) in `state.ts`, battery cutoffs (5% and 20%) in `signals.ts`, pre-flight limits in `preflight.ts` |
| 8   | Friend actions are human reports                | Messages name the friend and their chosen reason; the engine infers nothing about a friend's report                                                                                                                                                                |
| 9   | Pre-flight and sweep are pure                   | `preflight(snapshot, contract)` and `sweepScenarios(scenarios)` take their inputs and return a value                                                                                                                                                               |

## 4. Schema (`packages/schema`)

- **Time** is integer minutes since the Unix epoch everywhere (scenario files use minutes from the window start).
- **Contract** = corridor circle, window, milestones, group (members and watch slots), thresholds, confidence model,
  preset, wishes (`alert_order`, `offer_911_script`), `expires`, and an optional `demo` flag. The first member is the
  planner (her id is her lower-cased first name); the rest are friends.
- **Guards on the contract:**
  - An `area` milestone needs a radius of at least 200 m, because coordinates are quantized to ~110 m.
  - `expires` must cover the window end and every milestone's `by + milestone_grace_min`, or the engine would stop
    watching before a deadline could be judged.
  - `silence_min >= 2 x report_every_min`, so one late report is never read as silence.
- **Milestones** are a union: `area` (be inside a circle by `by`) and `home` (the phone's home geofence has fired by
  `by`). `who` limits it to some members; compile writes `["me"]` so friends are not held to her home time. A home
  milestone makes the pre-flight geofence check blocking.
- **Presets** (data in `preset.ts`), relaxed / standard / cautious:

  | Field                 | relaxed | standard | cautious |
  | --------------------- | ------- | -------- | -------- |
  | `silence_min`         | 30      | 20       | 12       |
  | `separation_min`      | 40      | 25       | 15       |
  | `score_floor`         | 0.4     | 0.5      | 0.6      |
  | `score_floor_min`     | 15      | 10       | 6        |
  | `ack_timeout_min`     | 7       | 5        | 3        |
  | `milestone_grace_min` | 20      | 10       | 5        |
  | `exit_alone_min`      | 60      | 45       | 30       |

  Also per contract: `separation_m` (150), `watch_slot_min` (90), `report_every_min` (3).

- **Demo nights.** `DEMO_THRESHOLDS` (report 1, separation 2, silence 3, exit-alone 3, ack 1 min) are carried in the
  contract with `demo: true`, so the whole story plays in minutes. The engine is unchanged and the plan screen says
  DEMO NIGHT.
- **`DraftPlan`** is what Gemini fills: friends, hours, radius, preset, watch order, optional `home_by_hours`, the 911
  flag and a read-back. Ids, thresholds and clock arithmetic are computed in code, never by the model.
- **`normalizeContract(raw)`** parses a stored contract and fills thresholds added after it was saved from the
  contract's own preset (a relaxed night does not silently become standard). `PgStore` reads through it.
- **Evidence.** `area` is required unless `homeArrived` is true. An arrival is an event, not a place.
- **Friend actions** are `confirm` or `worry` with an optional reason: `cant_find`, `not_answering`, `feels_off`.

## 5. Engine (`packages/engine`)

`evaluate(contract, state, evidence, actions, now)` returns `{ state, alerts }`. It clones the state, throws if the
state version differs from `ENGINE_STATE_VERSION` (currently 7), and runs per tick:

1. Ingest evidence in time order (items after `now`, other contracts and non-members are ignored).
2. Apply friend actions.
3. For each member: update cohesion; if she is home, resolve any open incident and move on; otherwise, if she has
   reported at least once, `observe` then `detectConcern`, then open a rung-1 incident (respecting the cooldown) or
   `stepIncident` on the open one.

Call it once per minute for exact timings; the low-confidence dip is tracked tick by tick.

### 5.1 Files

| File            | Responsibility                                                                           |
| --------------- | ---------------------------------------------------------------------------------------- |
| `evaluate.ts`   | Thin orchestrator for the tick above                                                     |
| `ingest.ts`     | Folds a report into `PersonState`; late older reports; arrivals; milestone reach         |
| `actions.ts`    | Applies confirm and worry, with outcomes logged (`applied` / `rate_limited` / `ignored`) |
| `observe.ts`    | The only step that updates tick-level tracking (score-dip timer, soft battery note)      |
| `signals.ts`    | Silence classification                                                                   |
| `confidence.ts` | Confidence of normal                                                                     |
| `cohesion.ts`   | Apart / together, `apartSince`, `togetherAt`, exit-alone clock                           |
| `milestones.ts` | `applicable`, `isMet`, `overdue`, `tracksHome`                                           |
| `concerns.ts`   | Detectors in priority order (`DETECTORS`); `SEVERITY` is each kind's default             |
| `ladder.ts`     | Resolve, upgrade in place, or escalate one open incident                                 |
| `incidents.ts`  | Open and resolve incidents; cooldown                                                     |
| `render.ts`     | The one place an incident becomes alert text and recipients                              |
| `templates.ts`  | Every alert, factor and reason string (fixed templates)                                  |
| `watchers.ts`   | `watcherFor` (current slot, else first of `alert_order`), `nextAfter`                    |
| `preflight.ts`  | Readiness checks                                                                         |
| `replay.ts`     | `replay` / `rebuild`: derive state and alerts purely from the logs                       |
| `handoff.ts`    | Placeholder note for the pickup and stall timers, which are not built                    |

### 5.2 Who is monitored

A member is monitored **from their first report**. Until then no incident is opened about them and they are not a
comparison peer (peers must be fresh). A friend who has not installed the app, or whose phone is off, therefore raises
nothing. With only one phone reporting, the group-based detectors (separation, exit-alone, unexplained stop) are inert
because there is nobody to compare her with. A friend's worry about someone who never reported is a human report: it
still opens an incident and climbs. The "left the area" and "stopped moving" clocks also start at the first report.

### 5.3 Ingest rules

- An **arrival** (`homeArrived`) marks her home and ignores any location on it and on every later report.
- A report **without permission** sets `permissionLost` and its location and motion are not trusted.
- A **late, older report** still counts for things that happened (arriving home, being in the corridor, reaching a
  milestone) but her current area, battery and motion stay with the newest report: an old fix cannot move her back.
- She **moved** if motion is not `still` or her rounded area changed. Her area inside the corridor refreshes
  `lastCorridorAt`; reaching an `area` milestone's circle marks it met, even late.

### 5.4 Confidence of normal

`N = exp(-sum w_i * max(0, x_i / tau_i - 1))`. Each stream costs nothing until its clock passes `tau`.

| Stream     | w             | tau    | x                                   |
| ---------- | ------------- | ------ | ----------------------------------- |
| corridor   | 1             | 20 min | time since last in the planned area |
| movement   | 0.5           | 90 min | time since she last moved           |
| freshness  | 1             | 10 min | time since the last report          |
| separation | 0.4 (cap 0.4) | 60 min | time apart from the group           |

The separation penalty is **capped**, so N stays above ~0.67 from separation alone and can never cross any preset's
score floor. Separation only tips the score when combined with silence or leaving the area. Weights and taus are in
`contract.confidence` (`DEFAULT_CONFIDENCE`, starting values to be calibrated with the sweep).

### 5.5 Silence classes

In order: permission revoked -> `evidence_lost`; silent for less than `silence_min` -> `none`; battery at or below 5%,
falling and not charging -> `battery_death`; battery above 20% and she had already been apart for `separation_min` when
she went dark -> `unexplained`; otherwise `quiet`.

### 5.6 Cohesion

- **Fresh** peer = reported within `silence_min`, location trusted, permission on, not home.
- **Apart** = farther than `separation_m` from every fresh peer, with at least one fresh peer. With no fresh peers, or
  a one-person group, the engine cannot tell and she is not apart.
- `apartSince` only moves while she herself is fresh and **freezes** when she goes quiet, so the engine can ask "had she
  been apart before her phone went dark?" (`wasSeparatedAtLastReport`).
- **Exit-alone clock** (`exitAloneSince`) starts at the tick she goes from _with somebody_ to _apart from every fresh
  peer_, only if her last motion was walking or vehicle, and only if a home milestone applies to her. So it never
  starts for someone who was never with the group, who is apart but still, who left with a friend, or who has no home
  milestone. It clears when she gets home or rejoins and freezes while she is quiet.

### 5.7 Detectors (priority order)

| #   | Detector           | Fires when                                                     | Severity                                                       |
| --- | ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `evidenceLost`     | permission off                                                 | notice: told once, never escalates                             |
| 2   | `batteryDeath`     | dying battery                                                  | returns "suppress": nothing raised, a soft note is recorded    |
| 3   | `unexplainedStop`  | silent and was separated at last report with battery above 20% | hard                                                           |
| 4   | `lowConfidence`    | N below `score_floor` for `score_floor_min`                    | hard                                                           |
| 5   | `exitAloneOverdue` | `now > exitAloneSince + exit_alone_min`                        | hard                                                           |
| 6   | `missedMilestone`  | an applicable milestone is unmet past `by + grace`             | advisory while she reports; hard once silent for `silence_min` |
| 7   | `separation`       | apart for `separation_min` while she is reachable              | advisory                                                       |

The first detector with an opinion wins. New concerns are added to `DETECTORS`, not to the loop.

### 5.8 Severity and the ladder

Severity is **stored on the incident**: `hard` climbs, `advisory` is a nudge to her only, `notice` is told once. So one
kind can be advisory while she is reachable and hard once she is quiet.

- Rung 1 nudge to her -> rung 2 current watcher -> rung 3 next person -> rung 3 whole group, one step per
  `ack_timeout_min`.
- **Only a human reaches rung 4:** a `worry` from the current watcher. The takeover message goes only to that friend,
  with the 911 script as text if the contract wishes allow it.
- Only a hard concern upgrades an advisory incident (kind and/or severity; the ack timeout restarts from the upgrade).
  Two advisories never swap places. An advisory-only tick closes a stronger open incident.
- Returning evidence resolves from any rung. Resolve and confirm start a 30-minute cooldown, **except** closing a
  nudge as `rejoined` or `arrived`, which starts none (a second wander-off is nudged again).
- Nudges that can end on their own (`separation`, `missed_milestone`) know whether their situation still holds. While
  a separation nudge is open it holds the floor and the late-nudge is not shown beside it; if she goes quiet while
  apart, the nudge is held open so the stronger concern is not blocked by a cooldown.
- A `worry` incident is not closed by normal evidence, only by a confirm or the home event.

### 5.9 Friend actions

- `confirm` resolves her open incident from any rung. It also restarts her exit-alone clock if one is running, even with
  no incident open yet: the next alert comes `exit_alone_min` after the confirm, not the moment the cooldown ends. With
  nothing to confirm it is logged as ignored.
- `worry`: one per friend per person per 15 minutes. With no incident open it opens a rung-2 incident for the watcher
  even when evidence is normal; if the worrier is the current watcher it goes straight to rung 4. On an existing
  incident it raises the rung to at least 2 (4 for the watcher) and attributes it to the friend.
- Actions are ignored if the actor is not a member or targets themselves.

### 5.10 Rendering and wording

`render.ts` is the only place an incident becomes text. Every string is a fixed template; recipients depend on the
step (self, watcher, next, group, friend). Friend-attributed text reads "{friend} reports: {reason}." Factors (at most
three) are observable only: no update for N min, not seen in the planned area, no movement, battery at last update,
left the group N min ago, past a planned time, apart for N min, and the score. `lastKnown` is a rounded, historical
area and never live.

### 5.11 Replay and state versioning

`replay` evaluates every minute from `window.start`, delivering each item at `max(window.start, t)`. State is
therefore always rebuildable and recorded nights replay identically. `EngineState.version` is checked by `evaluate`;
bump `ENGINE_STATE_VERSION` whenever state or incident semantics change. The API runner rebuilds a stale cache instead
of trusting it; a rebuild emits no alerts for past minutes (see "Open items").

### 5.12 Pre-flight

`preflight(snapshot, contract)` returns `ready`, `ready_with_warnings` or `not_ready`.

- **Blocking:** background location, notifications, round trip under 5 s, a first live update within 60 s, at least
  one accepted and reachable watcher, contract confirmed, and the home geofence if the contract has a home milestone.
- **Warnings:** battery restrictions or low-power mode, starting battery under 40%, only one watcher, and the home
  geofence when no home time was set.

## 6. API (`apps/api`)

| Route                                                                     | Behavior                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /contracts/compile`                                                 | Sentence -> `DraftPlan` -> `buildContract`; returns contract, read-back, terms, join code. 503 `compiler_unavailable` if the model fails |
| `POST /contracts/:id/preset`                                              | Change preset while a draft (409 once active); demo nights keep their shortened timers                                                   |
| `GET /contracts/:id`                                                      | Contract and status                                                                                                                      |
| `GET /contracts/:id/backstage`                                            | Presenter view: who is reporting, quiet, home or not joined; open incidents; who was told what. **State only, no location of any kind**  |
| `GET /join/:code`                                                         | Owner and friends of a night for a 6-character code (409 if ambiguous)                                                                   |
| `POST /contracts/:id/watchers/:who/accept`, `GET /contracts/:id/watchers` | A friend agrees to watch. "Reachable" equals "accepted" until push exists                                                                |
| `POST /preflight`                                                         | Stores the report; `POST /contracts/:id/activate` returns 409 unless ready                                                               |
| `POST /evidence`                                                          | Parse (rounds), membership check, clamp `t` to now, drop `area` on an arrival, append                                                    |
| `POST /actions`                                                           | Append a friend's confirm or worry (`t` clamped to now)                                                                                  |
| `GET /incidents?contractId=&to=`                                          | Alerts, optionally only those addressed to one person (the friend view polls this)                                                       |
| `GET /health`                                                             | Pre-flight times this round trip                                                                                                         |

- **Compile.** `buildContract` is deterministic: the contract id is `c_` plus 10 hex of a hash of sentence, time and a
  random nonce (so the same sentence twice makes two nights). Friends are de-duplicated and lower-cased, watch slots
  split the window evenly in watch order, and `expires` is the later of the window end and home time, plus 120 min.
  Only a home time she states becomes a home milestone, and it binds only her.
- **Gemini** is used for the draft only, with a JSON schema, retries on 429/500/503, and zod re-validation of its
  output. The read-back is replaced by the deterministic terms if it contains a banned word. With no API key a keyword
  mock stands in (`MockCompiler`). The deterministic **terms** are always shown beside the read-back so she can check it.
- **Join code** is the first 6 hex digits of the contract id, upper-case. A convenience, not a secret.
- **Runner** (`runner.ts`) ticks every 60 s on the injected clock. It folds new rows one minute at a time so a missed
  tick catches up with exact timings. Each row is delivered once, at the first minute evaluated at or after its time.
  The cursor only advances over rows that are due; a second tick in an already-evaluated minute fetches nothing, so no
  row is marked delivered without reaching the engine. A stale-version cache is rebuilt from the logs.
- **Stores** (`Store` interface): `PgStore` (Postgres/TimescaleDB) and `MemoryStore` (tests, `STORE=memory`). Reading
  active contracts skips one unreadable row but fails loudly if none can be read.
- **Scripts.** `pnpm demo` runs a scripted night through the real routes on a fake clock. `pnpm demo:friends <CODE>`
  plays the friends' phones against a running API (`pnpm api:demo` starts it in demo mode with the memory store).

## 7. Storage

| Table          | Contents                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `contracts`    | `body` jsonb, `status` (draft/active), `readiness` jsonb                                                                   |
| `evidence`     | TimescaleDB hypertable (1-day chunks), `seq`; `lat`/`lon` nullable only when `home_arrived` is true (CHECK, migration 006) |
| `actions`      | Append-only friend reports with a `seq`                                                                                    |
| `incidents`    | One row per alert, `body` jsonb; inserts are idempotent on the alert id                                                    |
| `watchers`     | Who accepted, first acceptance kept                                                                                        |
| `engine_state` | **Derived cache** with `ev_seq` / `act_seq` cursors; a fifth table beyond the logs                                         |

Migrations are plain SQL files applied in order, each in a transaction (`schema_migrations`).

## 8. Mobile (`apps/mobile`)

- **Roles.** A phone is the planner or one friend of one night (`identity.ts`), kept in AsyncStorage. There is no auth.
- **Planner:** Plan (first name and a sentence -> read-back, terms, preset, join code) -> Pre-flight (a real snapshot,
  set home, share the night code, see who joined) -> Start -> Status ("watching"; messages to her). The preset
  consequence line comes from the bundled `sweep.json`, so the app invents no numbers.
- **Friend:** join by 6-character code or full night code, pick who they are (this accepts the watch), see alerts
  addressed to them (poll every 20 s), and tap "I'm with her" or "I'm worried" with an optional reason. The rung-4
  script is text only; the last-known area opens in Maps.
- **Android reporting.** A foreground-service location task (`background.ts`) reports at the contract's
  `report_every_min`, surviving the app being closed. The night (contract id, person, expiry, cadence) is stored on
  the phone because Android may run the task after restarting the process. Motion is estimated from the previous fix
  when Android reports no speed; reports are rounded before they leave the phone.
- **Home geofence** (`home.ts`): "set home" stores the position on the device only and registers a 150 m geofence.
  Entering it during a night sends one `homeArrived: true` report with no area, then stops reporting. Android
  geofences can fire a minute or two late, so the last ordinary reports sit near home (documented limit).
- **iOS** is supported for the friend side: location while the app is open and a timer-based reporter. Background
  reporting and the home geofence setup are Android code paths. `plugins/withFmtCxx17.js` builds the `fmt` pod as C++17
  so the iOS build works on Xcode 26.
- **Nudges are facts, never instructions.** Opening the app sends a fresh report, which clears silence and low-score
  nudges. There is deliberately no "I'm fine" button.

## 9. Simulator and calibration (`packages/sim`)

- **Scenarios** are generated files (`packages/sim/scripts/generate-scenarios.ts`, `docs/scenarios.md`); never
  hand-edit them. Each carries ground truth: `normal`, `concerning` or `excluded`.
- **Runner** replays a scenario from its logs, minute by minute, optionally swapping the preset. **Judge** checks the
  first qualifying alert's rung and window, the max rung, and how the incident resolved.
- **Sweep** reports, per preset, false alerts per normal night, median and worst minutes to alert, and known misses.
  The numbers live in the committed `sweep.json` (also bundled into the mobile app and the console); read them there,
  not from prose. Treat them as directional: there are only three concerning scenarios and the presets are starting
  points, not tuned values.
- **Tests** include determinism (same scenario twice, same alerts) and preset monotonicity.

## 10. Console (`apps/console`)

A Vite page with two views: replay (confidence-of-normal curves per member with alert markers and the alert list) and
sweep (false alerts against median time to alert, one point per preset). Both read generated JSON. The group map and
scrubber were cut for time.

## 11. Testing and CI

- `pnpm test` (vitest) covers schema, engine (including banned words, cadence, hardening, replay and every
  pre-flight check), API (in-memory), the demo script, and the simulator. `pnpm test:db` replays the API and every
  scenario on real Postgres; `pnpm test:gemini` runs the live model tests. Those and the handoff stubs are skipped by
  default.
- CI runs typecheck, lint, tests and `pnpm sim run`; regenerates scenario, sweep and replay files and fails on any
  diff; and runs `pnpm test:db` against a TimescaleDB service. The mobile app is not part of CI.

## 12. Privacy and trust model

- Coordinates are rounded to 0.001 degrees (~111 m north-south, ~80 m east-west) on the phone and again on the server.
- Home is device-only. The server learns `arrived`, never where home is. Normal reports before arrival still trace her
  approach to within ~110 m of home.
- Alerts carry only a rounded, historical last-known area; the backstage view carries none.
- **No authentication.** A night code plus a member name is the whole identity. Anyone with the id or join code can
  read who is in a night and post as a member, and `GET /incidents` without a `contractId` returns every night's
  alerts. Auth was out of scope; it must be added before real use.

## 13. Decision log

- **No check-ins.** Opening the app already sends a report; nudges the app cannot clear are worded as facts.
- **Phones report every 3 minutes** (`report_every_min`, contract data). Cautious's 12-minute silence is exactly four
  reports. Silence trips 12 min after the last report (the incident turns hard), a friend is alerted at 15 (the 3-minute
  ack), and a report arriving first cancels it, so a friend hears only after five consecutive missed reports. Detection
  timing is measured from the last report and does not depend on the cadence (tested at 1, 2, 3 and 5 min).
- **An arrival is an event, not a place.** Schema, API, engine and DB all enforce it (see section 12).
- **A late, older report cannot move her back** (state version 7).
- **Contract ids carry a random nonce**; join codes are the first six hex digits of the id. A prefix collision answers 409.
- **Backstage shows state, never position**, so it is not live location sharing.
- **Demo nights are contract data**, not a code path.
- **Gemini fills a small `DraftPlan`**, not the full contract.
- **Safe place, set by address or on the spot.** The planner names it (Home, a friend's place) and types an address
  or uses where she is. The phone's geocoder resolves the address; the address and point stay on the device and the
  server still learns only `arrived` (invariant 5). It feeds the same `home_geofence` pre-flight check.
- **Emergency contact: friends reach them, BathroomBestie never does.** The planner adds a name and number
  (`/contracts/:id/emergency-contact`). Friends see it all night with Call and Text buttons that open their own phone
  with a fixed, pre-filled message. If the newest top-rung alert about her gets no friend response within
  `ack_timeout_min`, the friend's card and backstage show the fixed-template text BathroomBestie _would_ send: a
  demo only, nothing is sent (no SMS provider). Backstage's copy omits the map link.
- **A friend's report is labelled as one (invariant 8).** Any alert raised by a friend's "I'm worried" has kind
  `friend_worry`, even when it lifts an incident something else opened. The incident keeps its own kind, so detection
  and the ladder do not change; only the alert says whose report it is.
- **"Others in the group are still reporting near the last known area" is a factor, not a detector.** It is added when
  her phone has been quiet for at least half of `silence_min` and a fresh peer is within `separation_m` of her
  last-known area. It never raises, delays or silences an alert (a test pins the alert times).
- **Exit-alone is hard from the start**, and armed only for people a home milestone applies to.
- **Rung 3 and 4 semantics:** rung 3 is the next person and then the whole group; only a watcher's worry reaches rung 4.
  There is no separate "acknowledge" action.
- **A silent person who is together with the group** is not classed unexplained; the score can still alert.
- **`engine_state` is a derived cache**, not a source of truth.
- **Known limit: rounding versus `separation_m`.** People within ~80 m are never flagged apart (tested); between ~80 m
  and 150 m a false "apart" is possible, and real separations just over 150 m can look closer. Treat `separation_m` as
  good to about one grid cell; finer coordinates would conflict with invariant 5.

## 14. Open items

- **`docs/scope.md` is a placeholder.** Paste the real scope document and diff it against this file. This blocks final
  sign-off.
- **Rebuild backfill:** a rebuild after an engine version change emits no alerts for the past. Backfill, or accept?
- **Gemini outage:** compile returns 503; falling back to the offline mock is undecided.
- **No push delivery:** friends and the planner poll. `expo-notifications` is installed but nothing sends notifications.
- **Pickup and stall timers** are not built (`handoff.ts`).
- **iOS:** no background reporting or home geofence, so an iOS friend who backgrounds the app goes quiet (by the code, and not yet
  tested on a device, a monitored friend who goes quiet can raise incidents about themselves), and an iOS planner cannot satisfy the blocking geofence
  check for a home time.
- **Invariant 7 exceptions** listed in section 3.
- **Calibration** is thin (see section 9).
