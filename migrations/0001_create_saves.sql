-- Campaign saves, one slot per anonymous player.
CREATE TABLE IF NOT EXISTS saves (
  player_id  TEXT PRIMARY KEY,
  house      TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
