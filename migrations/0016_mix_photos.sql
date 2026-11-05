-- Basic Mix 3 and 4 are the same grill as Basic Mix 2, only bigger: they share its photo
-- until they get their own. A photo uploaded on the manager page is left alone.
UPDATE items SET image = (SELECT image FROM items WHERE name = 'Basic Mix 2')
  WHERE name IN ('Basic Mix 3', 'Basic Mix 4') AND image = ''
    AND (SELECT image FROM items WHERE name = 'Basic Mix 2') != '';
