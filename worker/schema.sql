-- Puzzles leaderboard: one row per player per puzzle (their best), and players' display names.
CREATE TABLE IF NOT EXISTS players (pid TEXT PRIMARY KEY, name TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scores (pid TEXT NOT NULL, puzzle TEXT NOT NULL, set_id TEXT NOT NULL, pts INTEGER NOT NULL, team TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pid, puzzle));
CREATE INDEX IF NOT EXISTS scores_set ON scores (set_id);
