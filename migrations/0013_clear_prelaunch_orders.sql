-- The site was found before the official launch (3 November 2026) and people
-- placed orders thinking it was open. Those orders are cancelled so they leave
-- the kitchen board. They stay in the database (name and phone included), so the
-- restaurant can still look them up if needed.
UPDATE orders
   SET status = 'cancelled',
       cancelled_by = CASE WHEN cancelled_by = '' THEN 'staff' ELSE cancelled_by END,
       updated_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE status != 'cancelled';

-- Sales figures, the day report and Popular count from the launch moment on.
INSERT INTO settings (key, value) VALUES ('sales_since', '1793678400')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
