-- Volcano Experience (rooftop) opens at 5 PM: Tuesday to Sunday, 5 PM to 11 PM. Monday closed.
UPDATE settings SET value = json_set(value, '$.hours', json('{"0":{"open":1020,"close":1380},"1":null,"2":{"open":1020,"close":1380},"3":{"open":1020,"close":1380},"4":{"open":1020,"close":1380},"5":{"open":1020,"close":1380},"6":{"open":1020,"close":1380}}')) WHERE key = 'rooftop';
