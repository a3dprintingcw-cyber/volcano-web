-- New photo for the Chopped Cheese Loaded. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'chopped-cheese-loaded' WHERE name = 'Chopped Cheese Loaded' AND image = '';
