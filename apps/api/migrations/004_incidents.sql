-- Alerts emitted by the engine (one row per alert; incident_id groups a ladder).
CREATE TABLE incidents (
  id          text PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contracts (id),
  incident_id text NOT NULL,
  rung        smallint NOT NULL CHECK (rung BETWEEN 1 AND 4),
  person_id   text NOT NULL,
  t           integer NOT NULL,
  body        jsonb NOT NULL
);
CREATE INDEX incidents_contract_t ON incidents (contract_id, t);
