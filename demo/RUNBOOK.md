# Demo runbook (one script, two machines)

Both machines run the **same commit** of this repo and the **same conductor** (`apps/api/scripts/conductor.ts`
with the flows in `demo/flows/`). Neither side is told when to act: each waits on what the **server** says
(a new plan, everyone joined, the night started, an alert, Ana home). The only things a person does are the
start commands below. Raw run is about 14 minutes; the video is 2:00 (section 5).

## 0. The contract (check this first, on both machines)

| Thing             | Value                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Commit            | `git rev-parse --short HEAD` must be **identical** on both machines (use `main` once PR #37 is merged)   |
| API (Emily's Mac) | `http://100.76.108.32:3000` over Tailscale, demo mode, live Gemini, memory store                         |
| Night             | Ana, then friends **Cynthia, Bea, Dee** in that order (Cynthia = first watcher)                          |
| Sentence          | `Out with Cynthia, Bea and Dee until 2am, home by 4 hours. Be careful please.`                           |
| Places            | bar 43.650,-79.380 · safe place 43.665,-79.380 (adb is **longitude first**)                              |
| Never             | restart the API mid-take; tap **Call** on an iOS Simulator; run the full conductor to test a single flow |

## 1. Before anyone starts (in parallel, about 10 min)

| Emily (iOS + API)                                                                                               | Elika (Android)                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `git pull`; note `git rev-parse --short HEAD`                                                                   | `git pull`; **same hash as Emily**                                                                             |
| Stop any old API. Start fresh: `GEMINI_MODEL=gemini-3.5-flash-lite pnpm api:demo` (log says `compiler: gemini`) | `adb devices`: two emulators (Ana, Bea); note both serials                                                     |
| `curl localhost:3000/health` and `curl http://100.76.108.32:3000/health` both `{"ok":true}`                     | `curl http://100.76.108.32:3000/health` is `{"ok":true}` (from her Mac **and** from Chrome inside an emulator) |
| Cynthia and Dee simulators booted; Metro running; app shows Welcome                                             | Metro running with `EXPO_PUBLIC_API_URL=http://100.76.108.32:3000`; app on both emulators shows Welcome        |
| `maestro --version` is 2.x; `mkdir -p ~/Movies/bathroombestie-demo`                                             | `maestro --version` is 2.x; screen recorder ready for the two emulator windows                                 |
| `curl localhost:3000/demo/latest` says `no_night_yet`                                                           | clocks match: `adb -s <serial> shell date` within a minute of her Mac                                          |

**Go signal:** Emily says "API fresh, starting". Elika says "ready" only when her whole column is green.

## 2. Start order (this order matters)

1. **Emily:** start recording her screen if she wants a laptop view, then
   `pnpm demo:conductor ios --record ~/Movies/bathroombestie-demo`
   It places Cynthia and Dee at the bar, starts recording both, and waits for Ana's plan.
   (If a plan already exists, add `--existing`. It also follows any re-plan.)
2. **Elika:** start her screen recording of both emulators, then
   `pnpm demo:conductor android --api http://100.76.108.32:3000 --ana <ANA_SERIAL> --bea <BEA_SERIAL>`
3. **Both:** hands off. Do not touch any phone until `done` on both sides.

## 3. What happens, with timing (T = Ana taps Start)

Times are from the runs on the iOS Simulators and the engine's demo timers; the Android UI steps are
estimates (not yet run on an emulator).

| When                        | Machine | Automatic action                                                                                      | Log line to expect                     |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| T-4:30                      | Elika   | Ana opens Plan, types name and sentence, Make my plan, "The plan looks right"                         | `PLANNED. CODE xxxxxx`                 |
| T-3:40                      | Emily   | Sees the code via `/demo/latest`, joins Cynthia (about 27 s), then Dee (about 27 s) by typing it      | `CODE`, `JOINED cynthia`, `JOINED dee` |
| T-3:40                      | Elika   | Joins Bea (about 25 s), then waits until Cynthia, Bea and Dee have all joined                         | `JOINED bea`, `everyone has joined`    |
| T-2:30                      | Elika   | Moves Ana to the safe place, taps **I'm there now, use this spot**, moves her back to the bar         |                                        |
| T-1:45                      | Elika   | Emergency contact (Mom), **Check I'm ready**, grants permissions, **Start the night**                 |                                        |
| **T**                       | both    | The night goes active; the friend phones show "The night is on" within 20 s and start reporting       | `T0: the night is active` (both)       |
| T to T+3:00                 | both    | Hold. Friends report every minute; Ana is at the bar. **Quiet stretch.**                              | `holding at the bar for 180s`          |
| T+3:00 = **L**              | Elika   | Ana walks away: 5 steps, 15 s apart                                                                   | `WALK: Ana leaves the group`           |
| about L+3:30                | server  | Nudge to Ana (rung 1, "apart from your group for 2 min")                                              |                                        |
| about L+5:30                | Emily   | Cynthia's alert appears (rung 2: "ana left the group 5 min ago...")                                   | `ALERT for Cynthia`                    |
| alert + 12 s (about L+5:45) | Emily   | Cynthia picks **Not answering**, taps **I'm worried**, then **Text**, returns to the app (about 20 s) | `WORRIED`                              |
| about L+6:00                | server  | Rung-4 takeover for Cynthia; "Demo only" emergency-text preview appears                               |                                        |
| about L+6:00                | Elika   | Sees Cynthia's report on the server; waits 45 s                                                       |                                        |
| about L+6:45                | Elika   | Ana jumps to the safe place; the geofence reports "arrived" (no location)                             | `ARRIVING`                             |
| L+7:00 to L+8:00            | server  | Ana's view becomes `home`; the incident closes                                                        | `ARRIVED` (Emily), `done` (Elika)      |
| +15 s                       | Emily   | Holds on the result, closes both recordings                                                           | `done`                                 |

**Raw total:** about 14 minutes (about 4:30 setup, then T to T+3:00 hold, then about 7:00 from the walk to Ana home, then the 15 s tail).

## 4. Keeping the two machines in sync

- **The server is the clock.** Every wait is on a server fact, so a slow Gemini or a slow tap on one side just
  makes the other wait. Only one wait is fixed: Ana's 180 s hold, so the friends' phones report first.
- **Re-plans are followed.** If Ana's plan is redone before Start, Emily's conductor moves the friends to the new
  night. So Elika can retry the plan step, but **each retry costs about 1 min of re-joining**: test single flows
  with `maestro --device ... test demo/flows/<flow>.yaml`, and run the full conductor only when it should pass.
- **Aligning the two sets of video:** both conductors log `T0` with a wall-clock time (machines' clocks match).
  Cut both recordings at their `T0` line and lay them side by side. Cynthia's alert and Ana's arrival are the
  other two markers.
- **If one side fails mid-night:** stop both conductors (Ctrl-C closes the recordings properly), Emily restarts the
  API (a night cannot be reused), and everyone starts again from section 2.

## 5. The 2:00 video (cut from the raw run; captions at each jump)

| Video        | Source (raw)                                            | Voice-over                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 to 0:10 | Ana, home page                                          | "BathroomBestie is a safety net for a night out. Not watching you. Watching out for you."                                                                                                                                     |
| 0:10 to 0:28 | Ana, plan, read-back, code (T-4:30)                     | "You tell it your plan in one sentence. Gemini turns that into a plan and reads it back so you can check it. That's the only place AI is used. Every alert after this is fixed wording."                                      |
| 0:28 to 0:38 | Cynthia, Dee, Bea joining (T-3:40)                      | "Friends join with a short code. No accounts. Each one is a watcher."                                                                                                                                                         |
| 0:38 to 0:55 | Ana, safe place, emergency contact, Start (T-2:30 to T) | "She picks where she's ending up, and one emergency contact her friends can reach. The place never leaves her phone. BathroomBestie never calls anyone."                                                                      |
| 0:55 to 1:03 | Both phones, quiet (T to T+3:00, cut)                   | "Then it stays quiet. No check-ins. No live map. It only speaks if something looks off."                                                                                                                                      |
| 1:03 to 1:18 | Ana walking, her nudge (L to L+3:00, cut)               | "She leaves the group alone. First, a plain nudge to her: a fact, not an instruction."                                                                                                                                        |
| 1:18 to 1:35 | Cynthia's alert (about L+5:30)                          | "Nothing changes, so her first watcher is told, with the reasons and a rounded last-known area. If they don't respond, it moves to the next friend, then the whole group."                                                    |
| 1:35 to 1:52 | Cynthia, worried, emergency card, Text (about L+5:45)   | "A friend can say 'I'm worried'. That's a human report, and it says who. Or 'I'm with her' to close it out. They can text her emergency contact themselves. BathroomBestie only shows what it would send, and sends nothing." |
| 1:52 to 2:00 | Ana arriving (about L+6:45)                             | "She's safe. Her friends learn that she arrived, never where. Quiet when you're fine. There when you can't ask."                                                                                                              |

Captions: "Demo timers: minutes, not hours" at the start; "+3 min" at each cut.

## 6. Core features this shows

One-sentence plan with Gemini only at setup and a read-back; join by code; safe place and emergency contact kept on
the phone; quiet by default (no check-ins, no live map); a nudge to her; a friend alert with reasons and a rounded
last-known area; the ladder; a human "I'm worried" with a reason; the labelled "Demo only" preview (nothing is
sent); arrival with no location.

## 7. When a step lags or sticks (Android)

A flow that does not finish in 240 s is stopped (`--flow-timeout S`), and a failed Android step no longer ends
the night. The conductor prints `FLOW FAILED` and then `YOUR TURN (on <device>): ...` with the exact taps to do
by hand, and keeps waiting for the server to confirm. So a stuck emergency-contact screen costs one manual step,
not the whole run.

| Step                       | If it fails, do this by hand on Ana's emulator                                   | The conductor then waits for                           |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Plan                       | name `Ana`, the plan sentence, Make my plan, "The plan looks right"              | the new plan on the server (10 min)                    |
| Bea joins                  | Join a friend's night, the code in the log, Find the night, I'm bea              | all three friends joined (10 min)                      |
| Safe place                 | with Ana at the safe place, "I'm there now, use this spot"                       | 60 s (`--hand-wait S`), then moves Ana back to the bar |
| Contact, pre-flight, Start | Mom + number, Save contact; Check I'm ready (allow permissions); Start the night | the night going active (10 min)                        |

After the by-hand step the run carries on by itself: the 180 s hold, the walk, and the arrival.

**If the screen is lagging, it is almost always the emulator, not the API** (the API answers in milliseconds over
Tailscale). Check, in this order:

1. Only what is needed is running: Metro, two emulators, the conductor. Stop Gradle (`cd apps/mobile/android &&
./gradlew --stop`) and quit Android Studio after the build.
2. RAM: two emulators need about 6 GB free. Give each 2 GB or less, use the host GPU, and cold-boot them.
3. `adb -s <serial> shell top -n 1 | head -15`: if the emulator itself is pinned, restart it.
4. A pre-filled text box or the keyboard covering a button is the other usual cause: tap the field by hand once.
5. Still slow: run the full conductor once the emulators feel responsive, and keep Maestro's studio closed.

**Salvaging a night that is already stuck:** all three friends have joined, so do the stuck step by hand and tap
**Start the night**. Emily's conductor sees the night go active by itself. Then walk Ana yourself (`adb -s <ana> emu
geo fix -79.38 <lat>` for 43.652, 43.654, 43.656, 43.658, 43.660, 15 s apart, after 3 minutes), and finally to
43.665. Or press Ctrl-C and re-run; Emily's conductor follows the new plan.

## 8. Known limits

The iOS half has been run end to end. The Android flows are written from the screens' labels and have **not** been
run on an emulator, so the first full run may need a tap fixed (use `maestro studio`).
