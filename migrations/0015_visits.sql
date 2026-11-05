-- Visitor statistics for the manager dashboard. No cookies and nothing that identifies a person:
-- "vid" is a code that changes every day, made from the network address and browser on the server,
-- so the same phone counts once per day and cannot be followed from one day to the next.
-- kind: 'view' (page opened), 'dish' (a dish opened), 'cart' (the order sheet opened).
CREATE TABLE IF NOT EXISTS visits (
  id     INTEGER PRIMARY KEY,
  day    TEXT NOT NULL,              -- local date, YYYY-MM-DD
  at     INTEGER NOT NULL,           -- unix seconds
  vid    TEXT NOT NULL,
  kind   TEXT NOT NULL,
  page   TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',   -- Instagram, Google, Facebook, App, Direct, ...
  device TEXT NOT NULL DEFAULT '',   -- Phone, Tablet, Computer
  lang   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS visits_day ON visits (day, kind);
CREATE INDEX IF NOT EXISTS visits_at ON visits (at);
