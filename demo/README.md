# Demo automation

Plays the phones for the recorded demo by driving the **real apps** (Maestro taps and types on the iOS Simulators
and Android emulators) and watching the **server** for what to do next. The two sides share nothing but the API, so
nobody has to relay the join code or call the timing.

| Side            | Phones                       | Command                                                 |
| --------------- | ---------------------------- | ------------------------------------------------------- |
| iOS (Emily)     | Cynthia, Dee (iOS Simulator) | `pnpm demo:conductor ios [--record DIR]`                |
| Android (Elika) | Ana, Bea (Android emulator)  | `pnpm demo:conductor android --ana SERIAL --bea SERIAL` |

## One-time setup (each Mac that runs Maestro)

```
brew tap mobile-dev-inc/tap
brew trust --formula mobile-dev-inc/tap/maestro
brew install mobile-dev-inc/tap/maestro openjdk@17
```

The conductor points Maestro at Homebrew's `openjdk@17` itself (it is keg-only), or at `JAVA_HOME` if set. Android also
needs `adb` on the PATH.

## The API (one machine)

```
GEMINI_MODEL=<a model with quota> pnpm api:demo      # DEMO_MODE=1 serves GET /demo/latest
```

Both sides use `--api http://<that machine's address>:3000` (default `http://localhost:3000`). Start the API
before either conductor, and do not restart it mid-take: the night lives in memory.

## What happens, in order

1. **iOS conductor** places Cynthia and Dee at the bar and waits for a new plan (`--existing` joins one that is
   already waiting).
2. **Android conductor** plans the night as Ana (types the sentence in the real app, taps "The plan looks right"). The
   server's `GET /demo/latest` now has the join code.
3. **iOS** reads the code and joins Cynthia and Dee by typing it into the real Join screen. **Android** joins Bea.
4. Once every friend has joined, **Ana** saves her safe place (she is stood at the safe-place spot first, because
   "I'm there now" saves where she is), adds the emergency contact, runs pre-flight, and taps **Start the night**. That is T.
5. Ana holds at the bar for 180 s (so the friends' phones report first), then walks away.
6. The ladder runs on the server. When Cynthia (first named friend, so first watcher) gets her alert, **iOS** taps a
   reason and **I'm worried**, and optionally **Text** (never **Call**: the Simulator cannot place a call).
7. After Cynthia's report, **Android** walks Ana to the safe place; the geofence reports "arrived" (no location).
   **iOS** sees the arrival on the server and stops recording.

## Options

`ios`: `--cynthia`, `--dee` (name or UDID), `--record DIR`, `--no-text`, `--existing`, `--worry-delay S` (how long the
alert shows before the tap, default 12), `--tail S` (hold after arrival, default 15), `--wait MIN`.
`android`: `--ana`, `--bea` (adb serials), `--sentence`, `--name`, `--contact-name`, `--contact-phone`,
`--walk-delay S` (default 180), `--arrive-delay S` (default 45), `--worry-wait MIN`.

## Status

The **iOS** side was run end to end on iOS 26.5 simulators. The **Android** flows (`demo/flows/android-*.yaml`) and the
`android` role were written from the screens' labels and have not been run on an emulator: expect to adjust a tap or two
(use `maestro studio` to inspect the hierarchy; a pre-filled name box in the Plan screen is the likeliest miss).
