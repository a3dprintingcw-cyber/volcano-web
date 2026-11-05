-- New photo for the Single Slam Burger. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'single-slam' WHERE name = 'Single Slam Burger' AND image = '';
