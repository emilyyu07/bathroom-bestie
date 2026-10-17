-- Append-only friend reports.
CREATE TABLE actions (
  seq         bigserial PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contracts (id),
  type        text NOT NULL CHECK (type IN ('confirm', 'worry')),
  by          text NOT NULL,
  target      text NOT NULL,
  t           integer NOT NULL,
  reason      text CHECK (reason IN ('cant_find', 'not_answering', 'feels_off'))
);
