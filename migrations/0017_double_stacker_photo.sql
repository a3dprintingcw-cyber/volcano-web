-- New photo for the Double Stacker. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'double-stacker' WHERE name = 'Double Stacker' AND image = '';
