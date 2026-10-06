-- Phone notifications when an order is ready.
-- Keys the server needs but nobody should read. Never sent to any page.
CREATE TABLE IF NOT EXISTS secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A customer's phone that asked to be told about one order.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  endpoint   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (order_id, endpoint)
);
CREATE INDEX IF NOT EXISTS push_endpoint ON push_subscriptions (endpoint);
