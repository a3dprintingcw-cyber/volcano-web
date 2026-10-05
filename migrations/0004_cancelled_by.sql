-- Who cancelled an order: 'customer', 'staff', or 'payment' (online payment never completed).
ALTER TABLE orders ADD COLUMN cancelled_by TEXT NOT NULL DEFAULT '';
