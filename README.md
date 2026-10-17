# BathroomBestie

Autonomous safety net for a night out. See `CLAUDE.md` for invariants and `docs/` for design.

## Quickstart

Requires Node 22+, pnpm 9 (`npm i -g pnpm@9`), Docker.

    pnpm install
    pnpm db:up              # docker compose up, waits for TimescaleDB
    pnpm migrate            # applies apps/api/migrations to the local TimescaleDB
    pnpm test
    pnpm test:db            # API + every scenario against real Postgres (own _test database)
    pnpm sim run            # scenario table; exits nonzero on regression
    pnpm sim sweep          # writes packages/sim/out/sweep.{json,csv}
    pnpm sim replay         # writes out/replay.json for the console
    pnpm demo               # scripted night through the real API routes (in-memory store, fake clock): exit-alone, then an arrival
    pnpm api                # Fastify on :3000 (offline mock unless GEMINI_API_KEY is set)
    pnpm --filter @bathroombestie/console dev

Copy `.env.example` to `.env` to configure. Mobile: see `apps/mobile/README.md` (dev build required).

## Live demo on one emulator

Her phone is the emulator running the app; the friend driver plays Bea's and Cy's phones.

```bash
pnpm api:demo                      # API on :3000, in-memory store, DEMO_MODE (timers of minutes)
# in the app: Plan -> "Make my plan" (e.g. "Out with Bea and Cy for 5 hours, home by 4 hours");
# it shows a join code and a DEMO NIGHT line.
pnpm demo:friends <JOINCODE>       # friends join and report from the bar; b / c = "I'm with her", q = quit
adb emu geo fix -79.38 43.65       # put her at the bar (the corridor is centred on Toronto)
# in the app: pre-flight -> set home -> start the night, then:
adb emu geo fix -79.38 43.66       # she leaves alone
```

With the demo timers: nudge to her about 2 min after she is apart, her watcher is told about 5 min after she
left, and it climbs to the group a minute or two later. Press `b` or `c` to resolve it as that friend. The
scripted, no-phone version is `pnpm demo`.

## CI

`.github/workflows/ci.yml` runs on every PR and on `main`: typecheck, lint, `pnpm test`, `pnpm sim run`, a check that the
committed scenario/sweep/replay files match what the generators produce (regenerate with
`pnpm --filter @bathroombestie/sim generate && pnpm sim sweep && pnpm sim replay`, then `pnpm exec prettier --write
packages/sim`), and `pnpm test:db` against a TimescaleDB service. The mobile app is not part of CI (it installs separately).

## Layout

`packages/schema` zod types · `packages/engine` pure engine + preflight · `packages/sim` scenarios, run, sweep ·
`apps/api` Fastify + runner · `apps/console` Vite · `apps/mobile` Expo (separate install).
