-- Online payment through Sentoo.
-- An order paid online starts as 'awaiting_payment' and only reaches the kitchen
-- (status 'new') once Sentoo confirms the payment.
ALTER TABLE orders ADD COLUMN sentoo_transaction_id TEXT;
ALTER TABLE orders ADD COLUMN pay_url TEXT;
ALTER TABLE orders ADD COLUMN pay_state TEXT NOT NULL DEFAULT '';        -- Sentoo transaction status
ALTER TABLE orders ADD COLUMN pay_attempt TEXT NOT NULL DEFAULT '';      -- latest payment attempt status
ALTER TABLE orders ADD COLUMN pay_message TEXT NOT NULL DEFAULT '';      -- message from the bank, if any
ALTER TABLE orders ADD COLUMN pay_checks INTEGER NOT NULL DEFAULT 0;     -- status lookups in the current hour
ALTER TABLE orders ADD COLUMN pay_window_start INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN pay_checked_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS orders_sentoo ON orders (sentoo_transaction_id);
