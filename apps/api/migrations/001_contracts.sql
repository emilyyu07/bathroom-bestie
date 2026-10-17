CREATE TABLE contracts (
  id          text PRIMARY KEY,
  body        jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  readiness   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Derived cache of the engine fold. The append-only logs remain the source of truth.
CREATE TABLE engine_state (
  contract_id text PRIMARY KEY REFERENCES contracts (id),
  state       jsonb NOT NULL,
  ev_seq      bigint NOT NULL DEFAULT 0,
  act_seq     bigint NOT NULL DEFAULT 0
);
