-- Photos for the drinks. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'drink-water' WHERE name = 'Water' AND image = '';
UPDATE items SET image = 'arizona' WHERE name = 'Arizona' AND image = '';
UPDATE items SET image = 'soda' WHERE name = 'Soda' AND image = '';
UPDATE items SET image = 'drink-beer' WHERE name = 'Beer & Smirnoff' AND image = '';
