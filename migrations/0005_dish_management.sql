-- Managing dishes from the admin page.
-- A dish taken off the menu is archived, not deleted, so it can be put back.
ALTER TABLE items ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- Photos uploaded from the admin page. Each is stored in two sizes (JPEG).
-- A dish points to one with image = 'photo:<id>'.
CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  small      BLOB NOT NULL,
  large      BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
