# Remaining scope and delegation plan

Status as of `main` @ `bfb3270` (2026-10-17). Purpose: one place for the sync-up on what is left, who owns it, and in what
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

#### A3. Display names in alerts (M) — _deferred until after the milestone engine (now unblocked)_

- **Purpose.** Alerts currently use raw ids ("me's phone stopped sending updates"). Visible in any demo.
- **Spec.** Optional `group.names: Record<PersonId, string>`; `render.ts` maps id to display name; recipients (`Alert.to`,
  `raisedBy`) stay ids. Fallback is the raw id (so existing text and tests are unchanged). Names are length-capped,
  control characters stripped, and run through the same banned-word check as templates. `Contract` refine: every key is
  a member.
- **Cheaper alternative (decide at sync).** B passes her real name as the planner id instead of `"me"` (the compile body
  already has `me`). No schema change; costs: id collisions, ids changing with names.
- **Coordination.** Needs B: name field in the Plan screen and compile body.

#### A4. Scenarios, sweep metrics, calibration (M-L) — _partially done (scenarios 1-11)_

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

#### A6. Pickup and stall timers (M) — _stub; lowest priority, first to cut_

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

#### B5. Console: group map and scrubber (M) — _optional_

- Map of last-known areas and separation; incident timeline; step/scrub control on the replay page. Optional live mode
  reading `/incidents` (CORS already allows localhost).

#### B6. Plan screen follow-ups (S) — _incoming with A3_

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

## 4. Suggested delegation (most efficient split)

Principle: the work splits by _where it runs_. Elika owns everything on the device because she has the emulator setup and
has already verified flows there; Emily owns everything the simulator can prove. The interfaces between them already exist
(`homeArrived` in evidence, `Alert.to`), so neither blocks the other.

|                           | Emily (A)                                                              | Elika (B)                                                    |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Phase 1** (unblock)     | A7 CI + `pnpm demo` · A2 factor · start A1                             | **B1 geofence** (first) · B4 verify Postgres + Gemini        |
| **Phase 2** (core)        | A1 exit-alone + scenarios 12-13 · A5 hardening                         | B2 background reporting · B3 friend alert view + `to` filter |
| **Phase 3** (credibility) | A4 calibration, nudges per night, scenarios 14-15 · A3 names           | B6 name field · B5 console map (if time)                     |
| **Phase 4** (together)    | S1 scope reconcile · S2 sign-off · S3 final summary and demo rehearsal | same                                                         |

Why this order:

- B1 first because everything home-related waits on it; A1 is built in parallel so it is ready when B1 lands.
- CI first for A: it is quick, and it protects both owners for the rest of the project.
- B3 before B5: it is required for a demo that shows an alert reaching a friend; the console map is nice-to-have.
- Names late: cosmetic, and they touch both sides.

**Cut line, if time is short (cut in this order):** pickup and stall (A6) → console map (B5) → names (A3) → calibration
depth (A4) → local notifications on the friend view. Do **not** cut: B1, B3, S1, S3.

## 5. Estimated effort

No deadline was provided, so these are work-hours per owner. Map them to the hackathon end time at the sync.

| Phase | Emily           | Elika           |
| ----- | --------------- | --------------- |
| 1     | ~4 h            | ~5 h            |
| 2     | ~5 h            | ~8 h            |
| 3     | ~5 h            | ~4 h            |
| 4     | ~3 h (together) | ~3 h (together) |

Elika's side carries more risk (Android background work), so spare capacity on Emily's side should go toward helping verify
B1/B2 on the emulator, not toward new features.

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

1. Names: add `group.names`, or have the app pass her real name as the planner id? (A3)
2. Rung 3/4 semantics as described in S2. Agree?
3. Rebuild backfill policy (A5).
4. Compile fallback when Gemini is down: 503 or fall back to the mock? (B4)
5. Alert delivery for the demo: polling only, or polling plus local notifications? (B3)
6. Friend-side alert view: confirm it is in scope for the demo (B3).
7. Hackathon end time, to turn section 5 into a calendar and set the cut line.

## 8. Original definition of done: status

| Item                                                                                                                    | State                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm install && docker compose up -d && pnpm test && pnpm sim run && pnpm sim sweep` from a clean clone                | not re-verified from a clean clone (S3)                   |
| Determinism: same scenario twice gives identical alerts; sweep twice gives identical files                              | done, tested                                              |
| Tests: banned words, scenarios, each pre-flight check, confirm at each rung, worry with zero evidence, worry rate limit | done                                                      |
| Skipped tests listed                                                                                                    | 4 handoff `todo` (A1/A6), 32 skipped Postgres/Gemini (B4) |
| `CLAUDE.md`, README quickstart, `.env.example`                                                                          | exist                                                     |
| Final summary: what is real, what is stubbed, three riskiest assumptions                                                | pending (S3)                                              |
