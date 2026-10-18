-- The planner's emergency contact for a night: someone she picked, shown to her friends. One per
-- night; replacing it overwrites. Nothing is ever sent to this number (the automatic message is demo only).
CREATE TABLE emergency_contacts (
  contract_id text PRIMARY KEY REFERENCES contracts (id),
  name        text NOT NULL,
  phone       text NOT NULL
);
