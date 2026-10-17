-- A friend agreeing to watch a night. Setup-time only; the first acceptance time is kept.
CREATE TABLE watchers (
  contract_id text NOT NULL REFERENCES contracts (id),
  person_id   text NOT NULL,
  accepted_at integer NOT NULL,
  PRIMARY KEY (contract_id, person_id)
);
