-- The Frozen and Cocktail photos were the wrong way round.
-- Only the photos that came with the site are swapped: a photo uploaded on the manager page is left alone.
UPDATE items SET image = CASE image WHEN 'frozen' THEN 'cocktail' WHEN 'cocktail' THEN 'frozen' END
  WHERE name IN ('Frozen', 'Cocktail') AND image IN ('frozen', 'cocktail');

-- These two burgers come with volcano sauce, not burger sauce.
UPDATE items SET description = REPLACE(description, 'burger sauce', 'volcano sauce')
  WHERE name IN ('Mac ''N Cheese Burger', 'BLTC Smashed Burger');
UPDATE options SET name = 'No volcano sauce'
  WHERE name = 'No burger sauce'
    AND group_id IN (SELECT g.id FROM option_groups g JOIN items i ON i.id = g.item_id WHERE i.name IN ('Mac ''N Cheese Burger', 'BLTC Smashed Burger'));
