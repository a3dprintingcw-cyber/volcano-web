-- Arizona comes in three flavors. Sprite and Royal Club Ginger Ale join the sodas.
INSERT INTO option_groups (item_id, name, min_choices, max_choices, sort) SELECT id, 'Flavor', 1, 1, 0 FROM items WHERE name = 'Arizona';
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Watermelon', 0, 0, 1, 0 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Arizona' AND g.name = 'Flavor';
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Punch', 0, 0, 1, 1 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Arizona' AND g.name = 'Flavor';
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Lemon', 0, 0, 1, 2 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Arizona' AND g.name = 'Flavor';
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Sprite', 0, 0, 1, 2 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Soda' AND g.name = 'Choice';
INSERT INTO options (group_id, name, price_cents, alcohol, available, sort) SELECT g.id, 'Royal Club Ginger Ale', 0, 0, 1, 3 FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name = 'Soda' AND g.name = 'Choice';
