# Tether

Autonomous safety net for a night out. `docs/scope.md` is the source of truth; flag any conflict with it.

## Non-negotiable invariants (enforced by tests)

1. Engine is a pure function of (contract, state, evidence, actions, now). Never read the wall clock; `now` is an argument.
2. Evidence and friend actions are append-only; engine state is derived.
3. Gemini only at setup (sentence -> contract, read-back). Never in the alert path. Alert text comes from fixed templates.
4. Never call 911 or any authority. A friend may be shown a pre-filled script.
5. Locations rounded to ~100 m before storage. Home geofence lives on the device; server only receives an "arrived" event.
6. Alert wording = observable behavior or an attributed human report. No banned words (drug, spiked, intoxicated, drunk, sick, medical, unwell) — a test scans all templates.
7. Thresholds live in the contract as data, not constants in code.
8. Friend actions are human reports: messages name the friend and their chosen reason; no system inference.
9. Preflight and sweep are deterministic and pure over their inputs.

## Never

Detect drugging/intoxication or infer health. Add check-ins, panic buttons, or live GPS sharing.

## Commands

`pnpm test`, `pnpm sim run`, `pnpm sim sweep`, `pnpm typecheck`, `pnpm lint`.
