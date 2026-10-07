-- Sales figures, the day report and the Popular section count from this moment on.
-- Orders from before (demos and tests) stay in the database but are no longer counted.
-- The manager can set this moment again with "Start the sales figures fresh" on the admin page.
INSERT INTO settings (key, value) VALUES ('sales_since', CAST(strftime('%s', 'now') AS TEXT))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
