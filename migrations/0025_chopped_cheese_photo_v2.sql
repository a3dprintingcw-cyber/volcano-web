-- The Chopped Cheese Loaded photo under a new file name, so phones that saw it missing load it fresh.
UPDATE items SET image = 'chopped-cheese-loaded-2' WHERE name = 'Chopped Cheese Loaded' AND image = 'chopped-cheese-loaded';
