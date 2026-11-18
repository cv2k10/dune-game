-- Completed matches submitted from the victory screen.
CREATE TABLE IF NOT EXISTS scores (
  match_id    TEXT PRIMARY KEY,           -- one submission per match
  player_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  house       TEXT NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('victory', 'defeat')),
  time_sec    REAL NOT NULL,
  spice       INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (result, time_sec, spice DESC);
