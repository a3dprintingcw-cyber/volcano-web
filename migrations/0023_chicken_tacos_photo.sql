-- New photo for the Chicken Tacos. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'chicken-tacos' WHERE name = 'Chicken Tacos' AND image = '';
