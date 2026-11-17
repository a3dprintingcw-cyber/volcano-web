-- Volcano Experience (rooftop) has its own phone number.
UPDATE settings SET value = json_set(value, '$.phone', '+599 9 564 2266') WHERE key = 'rooftop';
