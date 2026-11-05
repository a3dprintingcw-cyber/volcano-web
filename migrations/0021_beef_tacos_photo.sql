-- New photo for the Beef Tacos. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'beef-tacos' WHERE name = 'Beef Tacos' AND image = '';
