-- New photos for the Mac 'N Cheese and Crispy Chicken burgers. Photos uploaded on the manager page are left alone.
UPDATE items SET image = 'mac-cheese-burger' WHERE name = 'Mac ''N Cheese Burger' AND image = '';
UPDATE items SET image = 'crispy-chicken-burger' WHERE name = 'Crispy Chicken Burger' AND image = '';
