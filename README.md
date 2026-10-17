# BathroomBestie

Autonomous safety net for a night out. See `CLAUDE.md` for invariants and `docs/` for design.

## Quickstart

Requires Node 22+, pnpm 9 (`npm i -g pnpm@9`), Docker.

    pnpm install
    docker compose up -d
    pnpm migrate            # applies apps/api/migrations to the local TimescaleDB
    pnpm test
    pnpm sim run            # scenario table; exits nonzero on regression
    pnpm sim sweep          # writes packages/sim/out/sweep.{json,csv}
    pnpm sim replay         # writes out/replay.json for the console
    pnpm api                # Fastify on :3000 (offline mock unless GEMINI_API_KEY is set)
    pnpm --filter @bathroombestie/console dev

Copy `.env.example` to `.env` to configure. Mobile: see `apps/mobile/README.md` (dev build required).

## Layout

`packages/schema` zod types · `packages/engine` pure engine + preflight · `packages/sim` scenarios, run, sweep ·
`apps/api` Fastify + runner · `apps/console` Vite · `apps/mobile` Expo (separate install).
