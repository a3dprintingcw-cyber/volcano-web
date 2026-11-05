-- The burger photo that came with the site shows the BLTC Smashed Burger, not the Double Stacker.
-- Only the photo that came with the site is moved: a photo uploaded on the manager page is left alone.
UPDATE items SET image = 'burger' WHERE name = 'BLTC Smashed Burger' AND image = '';
UPDATE items SET image = '' WHERE name = 'Double Stacker' AND image = 'burger';
