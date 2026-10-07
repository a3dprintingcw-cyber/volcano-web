-- Cola Zero is in the till, so it belongs on the website too. It goes right after Cola.
UPDATE options SET sort = sort + 1 WHERE sort >= 1 AND group_id IN (SELECT g.id FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Soda' AND g.name = 'Choice');
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Cola Zero', 0, 0, 1, 1 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Soda' AND g.name = 'Choice';
