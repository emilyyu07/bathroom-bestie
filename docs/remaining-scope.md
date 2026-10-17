# Remaining scope and delegation plan

Status as of `main` @ `bfb3270` (2026-10-17). About 24 hours remain; this plan assumes 18 working hours (section 4). Purpose: one place for the sync-up on what is left, who owns it, and in what
order. `docs/scope.md` is still a placeholder; reconciling it with the real scope document is item **S1** below and gates
the final sign-off.

Legend. **Owner**: A = Emily (`packages/*`, sim), B = Elika (`apps/*`), S = shared. **Size**: S ≤ 1 h, M ≈ 2-3 h,
L ≈ 4-6 h. **Verified** says how far each finished piece has actually been exercised: _unit_ (tests), _sim_ (scenarios),
_emulator_ (Elika's reported Android 15 emulator run), _unrun_ (written, never executed by the author).

---

## 1. Where things stand

| Area      | Functional today                                                                                                                                                                                                                                                                                        | Verified                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Schema    | Contract, evidence, actions, alerts, readiness, scenarios; presets as data; milestone union (`area` / `home`) with `who`; 200 m min area radius; `expires` guard; `normalizeContract`                                                                                                                   | unit                                             |
| Engine    | Confidence of normal (4 streams); silence classes; full ladder; confirm/worry with rate limit and cooldown; cohesion (separation nudge, duration rule, score penalty); milestones (overdue home/area, advisory then hard); severity stored per incident; replay/rebuild and state version 4; pre-flight | unit, sim                                        |
| Simulator | 11 scenarios, `run`, `sweep`, `replay`; determinism and preset-monotonicity property tests                                                                                                                                                                                                              | unit, sim                                        |
| API       | compile (Gemini or mock), preset, pre-flight, activate (409 unless ready), evidence, actions, incidents, watchers, health, `GET /contracts/:id`; per-minute runner with cursor rule and stale-cache rebuild                                                                                             | unit (in-memory); Postgres: _unrun by A_         |
| Gemini    | Setup compile only; structured output validated by zod; retries; banned-word guard on the read-back; offline mock                                                                                                                                                                                       | unit; live: _emulator_ (per Elika), _unrun by A_ |
| Mobile    | Plan (compile, read-back, terms, preset); real pre-flight (permissions, battery, round trip, first evidence, watchers, geofence _status_); Watcher accept + confirm/worry buttons; Status screen; reporter starts on activation and on foreground                                                       | _emulator_                                       |
| Console   | Replay (score curves, alerts) and sweep chart pages                                                                                                                                                                                                                                                     | serves 200; UI _unreviewed by A_                 |

Suite: 210 tests pass, 32 skipped (27 Postgres integration, 5 live Gemini), 4 `todo` (handoff stubs). Typecheck, lint
and `pnpm sim run` clean.

---

## 2. Open work, in detail

### Person A: engine, schema, simulator

#### A1. Exit-alone timer (L) — _not started; next_

- **Purpose.** "She left the group alone and nobody has confirmed she got home." Separation says she has drifted; this is
  the longer clock that ends in a friend being told. It is the main handoff benchmark.
- **Spec.**
  - New `PersonState.exitAloneSince`. Set on the transition from _with the group_ to _apart from every fresh peer_, only if
    her last report was moving (`walking` or `vehicle`), so a stuck GPS fix doesn't start it. Cleared when she gets home or
    rejoins.
  - Deadline = `exitAloneSince + exit_alone_min` (60 / 45 / 30 at relaxed / standard / cautious; already in the schema).
  - **Armed per person only if a home milestone applies to her** (decided). No home milestone, no exit-alone.
  - Overdue = past the deadline and neither home nor rejoined. Severity **hard** (decided): climbs the ladder after the ack
    timeout.
  - New detector `exitAloneOverdue` in `concerns.ts`; `exit_alone` incident kind (the alert kind already exists in the
    schema); fixed watcher/group templates, observable wording only; state version 5.
  - A leaving-with-a-friend case is _not_ exit-alone (she still has a fresh peer within `separation_m`).
- **Tests.** Arrives in time; never arrives; rejoins; leaves with a friend; re-leaves; cautious (30 min) boundary;
  replay equals live fold.
- **Depends on.** Milestone engine (done). End-to-end on a phone depends on **B1**.
- **Progress.** Design settled; schema fields present; no engine code.

#### A2. "Group still together nearby" factor (S) — _decided, not started_

- **Purpose.** When a phone goes quiet but her last-known area is still occupied by fresh peers, tell the watcher that
  context. Detection is unchanged (it still alerts); it only adds a factor.
- **Spec.** New factor template; added in `factorsFor` when she is quiet and at least one fresh peer is within
  `separation_m` of her last-known area.
- **Tests.** Factor present when together-and-quiet, absent when apart; banned-word scan covers it.

#### A3. Display names in alerts — **replaced by id-as-name (section 4.2)** _(original design kept below for reference)_

- **Purpose.** Alerts currently use raw ids ("me's phone stopped sending updates"). Visible in any demo.
- **Spec.** Optional `group.names: Record<PersonId, string>`; `render.ts` maps id to display name; recipients (`Alert.to`,
  `raisedBy`) stay ids. Fallback is the raw id (so existing text and tests are unchanged). Names are length-capped,
  control characters stripped, and run through the same banned-word check as templates. `Contract` refine: every key is
  a member.
- **Cheaper alternative (decide at sync).** B passes her real name as the planner id instead of `"me"` (the compile body
  already has `me`). No schema change; costs: id collisions, ids changing with names.
- **Coordination.** Needs B: name field in the Plan screen and compile body.

#### A4. Scenarios, sweep metrics, calibration (M-L) — _partially done (scenarios 1-11); calibration reduced to a minimal trade-off table (section 4.2)_

- **Purpose.** The sweep is the product's evidence for "false alarms vs speed". Today it has only two concerning nights
  (03, 11), so its medians are thin and the false-alert axis is skewed by scenario 4's hand-timed confirm.
- **Spec.**
  - Scenarios: 12 exit-alone arrives (none at standard, alerts at cautious), 13 exit-alone never arrives, 14 leaves the
    area while still reporting (score path), 15 quiet while together (current behavior documented, with the A2 factor).
  - Replace scenario 4's single confirm with confirms timed per preset.
  - Sweep: add "nudges per normal night" and advisory counts as additive fields (the console and mobile read
    `sweep.json`; additions don't break them).
  - `pnpm sim calibrate`: a grid over confidence weights/taus and preset values that prints the trade-off table. It
    reports; it does not auto-pick (about 15 scenarios would overfit).
  - Record chosen defaults and reasoning in `docs/scenarios.md`.
- **Tests.** Preset monotonicity holds on every new concerning scenario; sweep stays deterministic.

#### A5. Engine hardening (M) — _not started_

- Tests for three members with simultaneous incidents, out-of-order evidence, and behavior after `window.end` /
  `expires`; `watcherFor` with no slot.
- A friend's worry on an _existing_ incident emits an alert whose kind is the underlying incident's, not `friend_worry`.
  Make the kind reflect the human report.
- **Decision needed:** rebuild after an engine version change emits no alerts for the past. Backfill, or accept silently?
- Replace the 4 skipped handoff `todo` tests with real ones as A1 lands.

#### A6. Pickup and stall timers — **dropped for this sprint (section 4.2)** _(stub stays)_

- **Spec sketch.** Stall = vehicle motion, then still outside home for more than N minutes. Pickup = needs a definition of
  what starts the timer. Both reuse the exit-alone machinery.

#### A7. CI and scripted demo (S + S) — _not started; unowned until now_

- **CI.** GitHub Actions: install, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm sim run`; plus a Postgres service for
  `pnpm test:db`. Today green depends on each author remembering to run everything.
- **`pnpm demo`.** A scripted end-to-end night on the in-memory store and a fake clock (compile, pre-flight, activate,
  drift apart and go dark, ladder, confirm). A whole night runs in a second, whereas the real API runs on the real clock.

### Person B: apps, API, infrastructure

#### B1. Home geofence registration and `homeArrived` (L) — **critical path blocker**

- **Purpose.** Without it no phone can ever report "arrived", so home milestones and exit-alone cannot work on a device.
- **Finding.** Pre-flight reads `hasStartedGeofencingAsync(HOME_GEOFENCE_TASK)`, but nothing in the app defines the task
  or starts a geofence. A home time makes the pre-flight geofence check _blocking_, so a contract with a home time is
  currently impossible to activate from the app.
- **Spec.**
  - A "set my home" step that stores the location **on the device only** (invariant 5: the server never receives home
    coordinates).
  - `TaskManager.defineTask(HOME_GEOFENCE_TASK)` and `Location.startGeofencingAsync`.
  - On enter, send an evidence report with `homeArrived: true`. Nothing else about home leaves the phone.
  - Pre-flight keeps reading task status; it must pass once registered.
- **Verify.** Emulator with mock location: leaving then entering the region produces one `homeArrived` report. Then an
  end-to-end run of sim scenarios 09-11 shapes against a real device.

#### B2. Background evidence reporting (L) — **risk: highest**

- **Purpose.** A phone in a pocket with the app closed must keep reporting, or the engine reads normal silence as
  disappearance.
- **Spec.** Run the reporter inside an Android foreground service (`startLocationUpdatesAsync` with a foreground-service
  notification) instead of a foreground timer. Send `permissionOk: false` once if permission is revoked, then stop. Keep
  the 5-minute cadence. Handle battery optimization.
- **Verify.** Emulator backgrounded for 15+ minutes still delivers reports. The Status branch's resume-on-foreground stays.

#### B3. Friend-side alert view (M) — **demo-critical**

- **Purpose.** Alerts are stored rows; nothing shows them to friends. Without this the demo cannot show the system
  reaching a friend.
- **Spec.** A friend's screen lists alerts addressed to them (rung, message, factors, last-known area, who raised it).
  At rung 4 it shows the pre-filled script as text **only** (invariant 4: never auto-dial).
- **API.** `GET /incidents` filters by `contractId` only. Add a recipient filter (`to=<personId>`); the `to` field
  already exists on every alert.
- **Delivery.** Real push/SMS is out of scope. Poll `GET /incidents`; optionally raise a local notification when the
  poll finds a new alert (nice for the demo, optional).

#### B4. Verify Postgres and Gemini on a real run (M) — _written, never run by A_

- Run `pnpm db:up && pnpm migrate && pnpm test:db` and `pnpm test:gemini` and report results at sync (27 + 5 tests are
  skipped in every run without them).
- Add a fallback decision for Gemini outages: compile currently returns `503 compiler_unavailable`. Either keep (she
  retries) or fall back to the offline mock.

#### B5. Console: group map and scrubber — **dropped for this sprint (section 4.2)**

- Map of last-known areas and separation; incident timeline; step/scrub control on the replay page. Optional live mode
  reading `/incidents` (CORS already allows localhost).

#### B6. Plan screen follow-ups (S) — _id-as-name: her real name goes in the compile body's `me` field_

- Name field in the compile body; show the home time in the terms (already returned by the API).

### Shared

#### S1. Reconcile with the real scope (S, blocking final sign-off)

- Paste the scope document into `docs/scope.md` and diff it against `docs/architecture.md` "Decisions to confirm". Both
  owners review.

#### S2. Rung 3 and rung 4 semantics (decision)

- Current reading: rung 3 = next person, then the whole group, one step per ack timeout; **only a watcher's worry
  reaches rung 4**. There is no separate "acknowledge" action. Needs both owners' sign-off.

#### S3. Final deliverable (S)

- Final summary: what is real, what is stubbed, three riskiest assumptions; README quickstart re-verified from a clean
  clone; rehearsed demo script.

---

## 3. Critical path and dependencies

```
B1 geofence ───────────────▶ A1 exit-alone end to end on a phone ──▶ demo: home-deadline and exit-alone
B2 background reporting ───▶ credible "quiet phone" demo
B3 friend alert view ──────▶ demo: a friend actually sees the alert
A4 scenarios/calibration ──▶ credible sweep numbers (independent of B)
A3 names ◀──────────────────▶ B6 (shared interface: group.names or id-as-name)
S1 scope reconcile ────────▶ final sign-off
```

The critical path is **B1**. A1 can be built and fully tested in the sim without it, but cannot be shown on a phone
until B1 lands. B2 and B3 are independent of each other and of A.

## 4. Plan for the remaining ~24 hours (about 18 working hours)

The raw estimates in earlier drafts summed to about 17 h for Emily and 20 h for Elika before any integration time, so
Elika's side did not fit. This plan cuts scope to fit 18 working hours each, with the last ~6 h of the clock held back for
sleep and demo preparation. `H0` is the sync-up.

### 4.1 What the demo must do (this defines priority)

Anything not on this path is cut or deferred.

1. Type a sentence that includes a home time; see the read-back and the terms (Gemini, or the mock).
2. Pre-flight reaches ready with a real watcher and a real home geofence.
3. Activate; the phone reports.
4. She drifts away or goes quiet; the ladder runs (nudge, watcher, escalation); her Status screen shows the nudge.
5. **A friend sees the alert** (rung, message, factors, last-known area) and taps "I'm with her"; it resolves.
6. Console replay and the sweep chart tell the "false alarms vs speed" story honestly, caveats included.

Fallback if the phone path breaks: the scripted `pnpm demo` plus the console replay carry steps 3-6.

### 4.2 Decisions made to fit the clock (changes from the first draft)

| Change                                                                   | Effect                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Pickup and stall timers (A6): **dropped**                                | Saves ~3 h; documented stub stays                                          |
| Console group map (B5): **dropped**                                      | Saves ~3 h; replay and sweep pages already exist                           |
| Names via `group.names` (A3): **replaced by id-as-name**                 | The app sends her real name as the planner id; no schema work (saves ~3 h) |
| Local notifications on the friend view: **dropped**                      | Polling only                                                               |
| `pnpm sim calibrate` full grid: **reduced** to a minimal trade-off table | Saves ~2 h                                                                 |
| Background reporting (B2): **timeboxed** to 4 h, with a go/no-go gate    | Fallback below                                                             |
| Geofence (B1): **timeboxed** to 4 h, with a gate                         | Fallback below                                                             |

### 4.3 Schedule (work-hours from the sync)

| Hours       | Emily (A)                                                                                                                                | Elika (B)                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **H0-H1**   | Sync: decisions in section 7; paste the real scope into `docs/scope.md` and diff it (**S1**); merge PR #8                                | Same                                                                   |
| **H1-H5**   | CI (1 h) · `GET /incidents?to=` (0.5 h, supports B3) · `pnpm demo` (1.5 h) · "group still together" factor A2 (0.5 h) · start A1 (0.5 h) | **B1 home geofence**, timeboxed 4 h                                    |
| **H5-H9**   | **A1 exit-alone** + scenarios 12-13 (4 h)                                                                                                | **B3 friend alert view** (3 h) · **B4 verify Postgres + Gemini** (1 h) |
| **H9-H13**  | A5 hardening subset · A4 minimal: scenarios 14-15, nudges-per-night metric, trade-off table (4 h)                                        | **B2 background reporting**, timeboxed 4 h                             |
| **H13-H15** | Pair with Elika on the emulator (verify geofence and background); id-as-name request                                                     | id-as-name field in the Plan screen (0.5 h) + fixes                    |
| **H15**     | **Feature freeze** (no new features after this)                                                                                          |                                                                        |
| **H15-H18** | Integration: clean-clone check, end-to-end dry run of the demo path, fix list, final summary (**S3**)                                    | Same                                                                   |
| **H18-H24** | Sleep and demo prep: script and talk track, rehearsal twice, backup screen recording                                                     | Same                                                                   |

Capacity check. Emily: 1 + 4 + 4 + 4 + 2 + 3 = 18 h. Elika: 1 + 4 + 4 + 4 + 2 + 3 = 18 h.

### 4.4 Gates (go / no-go)

| Gate    | Check                                                                                  | If it fails                                                                                                  |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **H5**  | Entering and leaving the home region on the emulator produces one `homeArrived` report | Ship a clearly labelled "simulate arriving home" debug action that posts the same report; say so in the demo |
| **H9**  | A friend can see an alert addressed to them and confirm it, end to end                 | Cut polish; the friend view is non-negotiable, shrink it to a plain list                                     |
| **H13** | The reporter keeps reporting while the app is backgrounded for 15+ min                 | Fall back to the foreground reporter; demo with the app open; list it as a known limitation                  |
| **H15** | Feature freeze                                                                         | Nothing new merges except fixes to the demo path                                                             |

### 4.5 Working rules for the sprint

- Small PRs (about 150 lines of hand-written change), reviewed within ~30 minutes, merged the same hour.
- Merge `main` into your branch before opening a PR; no long-lived branches.
- Announce any schema change before merging it.
- Generated files (sweep, replay, scenario JSON): regenerate after a merge; never hand-edit.
- Before every merge: `pnpm test && pnpm typecheck && pnpm lint && pnpm sim run`.
- Sleep: stagger it if possible, and do the integration block (H15-H18) with both people rested. A tired integration pass
  is where demo-breaking mistakes happen.

### 4.6 Delegation principle

The work splits by where it runs. Elika owns everything on the device because she has the emulator setup and has already
verified flows there. Emily owns everything the simulator can prove, plus CI, the demo script and the small API change that
unblocks the friend view. The interfaces between them already exist (`homeArrived` in evidence, `Alert.to`), so neither
blocks the other, and Emily's spare time at H13-H15 goes to pairing on the emulator, not to new features.

## 5. Cut line if the schedule slips

Cut in this order: local notifications (already cut) → calibration beyond the minimal table → scenarios 14-15 → hardening
beyond the multi-member and expiry tests → the "group still together" factor. **Never cut:** B1 (or its labelled fallback),
B3, the H15 freeze, S1, S3.

## 6. Risks

1. **Android geofence and foreground service** (B1, B2): the least-verified, highest-uncertainty work. Needs a development
   build; Expo Go cannot do it.
2. **Postgres and Gemini never run by A.** 32 tests are skipped without them. A single clean run at sync resolves it.
3. **Calibration is thin.** Two concerning nights and starting-point presets; the sweep is directionally right, not tuned.
4. **No alert delivery channel.** Fine within scope, but the demo needs B3.
5. **Location rounding vs `separation_m`.** Locations round to about 110 m, so the 150 m threshold is only reliable to
   about one grid cell (documented, tested for within ~80 m).
6. **Rebuild emits no alerts for the past** if the engine version changes mid-night (A5 decision).

## 7. Decisions for the sync

Already settled by the clock (section 4.2): names via id-as-name, no console map, no pickup/stall, polling-only alert
delivery, 18 working hours. Still to decide:

1. **Geofence fallback.** If the real geofence misses the H5 gate, is a clearly labelled "simulate arriving home" debug
   action acceptable for the demo?
2. **Rung 3 and 4 semantics** as described in S2. Agree?
3. **Rebuild backfill policy** (A5): backfill alerts after an engine version change, or accept silently?
4. **Compile fallback** when Gemini is down: 503 (she retries) or fall back to the offline mock? (B4)
5. **Friend view scope:** confirm a plain polled list with the rung-4 script as text is enough (B3).
6. **Sleep schedule:** staggered, or one shared block? The H15-H18 integration pass needs both people rested.
7. **Real scope document:** paste it at H0 and confirm nothing in it reshuffles this plan (S1).

## 8. Original definition of done: status

| Item                                                                                                                    | State                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm install && docker compose up -d && pnpm test && pnpm sim run && pnpm sim sweep` from a clean clone                | not re-verified from a clean clone (S3)                   |
| Determinism: same scenario twice gives identical alerts; sweep twice gives identical files                              | done, tested                                              |
| Tests: banned words, scenarios, each pre-flight check, confirm at each rung, worry with zero evidence, worry rate limit | done                                                      |
| Skipped tests listed                                                                                                    | 4 handoff `todo` (A1/A6), 32 skipped Postgres/Gemini (B4) |
| `CLAUDE.md`, README quickstart, `.env.example`                                                                          | exist                                                     |
| Final summary: what is real, what is stubbed, three riskiest assumptions                                                | pending (S3)                                              |
