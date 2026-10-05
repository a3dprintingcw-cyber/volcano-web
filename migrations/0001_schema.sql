-- Volcano Street Food: database schema (Cloudflare D1 / SQLite).
-- All money is stored in cents of a guilder (XCG).

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  note  TEXT NOT NULL DEFAULT '',
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  image       TEXT NOT NULL DEFAULT '',
  alcohol     INTEGER NOT NULL DEFAULT 0,
  available   INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS option_groups (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  name        TEXT NOT NULL,
  min_choices INTEGER NOT NULL DEFAULT 0,
  max_choices INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS options (
  id          INTEGER PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES option_groups(id),
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  alcohol     INTEGER NOT NULL DEFAULT 0,
  available   INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,          -- unguessable id, used in the tracking link
  number         INTEGER NOT NULL,          -- short number called out at the counter
  service_day    TEXT NOT NULL,             -- local date of the service, YYYY-MM-DD
  status         TEXT NOT NULL DEFAULT 'new', -- new, preparing, ready, done, cancelled
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  pickup_type    TEXT NOT NULL,             -- asap or scheduled
  pickup_at      INTEGER NOT NULL,          -- unix seconds
  total_cents    INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'pickup',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (service_day, number)
);
CREATE INDEX IF NOT EXISTS orders_day ON orders (service_day, status);
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  item_id          INTEGER,
  name             TEXT NOT NULL,
  options          TEXT NOT NULL DEFAULT '[]', -- JSON list of chosen option names
  note             TEXT NOT NULL DEFAULT '',
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items (order_id);

-- Small log used to slow down repeated order attempts and PIN guesses.
CREATE TABLE IF NOT EXISTS rate_events (
  id   INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  who  TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (kind, who, at);
