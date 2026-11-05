-- New photo for the Shrimp Tacos. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'shrimp-tacos' WHERE name = 'Shrimp Tacos' AND image = '';
