-- An arrival report ("she is home") is an event, not a place: it must not carry a location
-- (invariant 5: the server learns that she arrived, never where home is).
-- Every other report still needs one.
ALTER TABLE evidence
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lon DROP NOT NULL;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_area_unless_arrival
  CHECK ((lat IS NOT NULL AND lon IS NOT NULL) OR home_arrived IS TRUE);
