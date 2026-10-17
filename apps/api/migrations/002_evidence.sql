CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Append-only. Area is already rounded (~100 m) by the API before insert.
CREATE TABLE evidence (
  time          timestamptz NOT NULL,
  seq           bigserial,
  contract_id   text NOT NULL,
  person_id     text NOT NULL,
  t             integer NOT NULL,
  lat           double precision NOT NULL,
  lon           double precision NOT NULL,
  motion        text NOT NULL CHECK (motion IN ('still', 'walking', 'vehicle')),
  battery_pct   real NOT NULL,
  charging      boolean NOT NULL,
  permission_ok boolean NOT NULL,
  home_arrived  boolean
);
SELECT create_hypertable('evidence', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX evidence_contract_seq ON evidence (contract_id, seq);
