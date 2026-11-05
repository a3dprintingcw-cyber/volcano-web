-- New photo for the Surf & Turf Tacos. A photo uploaded on the manager page is left alone.
UPDATE items SET image = 'surf-turf-tacos' WHERE name = 'Surf & Turf Tacos' AND image = '';
