-- Puzzles leaderboard. players: one per name (unique, any case), PIN stored as a salted hash, wrong-PIN lockout.
-- tokens: a sign-in per device. scores: each player's best per puzzle, with the squad.
CREATE TABLE IF NOT EXISTS players (pid TEXT PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, pid TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tokens_pid ON tokens (pid);
CREATE TABLE IF NOT EXISTS scores (pid TEXT NOT NULL, puzzle TEXT NOT NULL, set_id TEXT NOT NULL, pts INTEGER NOT NULL, chem INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 0, team TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pid, puzzle));
CREATE INDEX IF NOT EXISTS scores_set ON scores (set_id);
CREATE INDEX IF NOT EXISTS scores_puzzle ON scores (puzzle, pts);
-- visit counter (anonymous): seen = each browser's first day, visits = browsers per day, views = tab opens per day,
-- online = each browser's last ping (on the site now = a ping in the last 2.5 min)
CREATE TABLE IF NOT EXISTS seen (vid TEXT PRIMARY KEY, day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, vid TEXT NOT NULL, site TEXT NOT NULL, PRIMARY KEY (day, vid, site));
CREATE TABLE IF NOT EXISTS views (day TEXT NOT NULL, page TEXT NOT NULL, site TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, page, site));
CREATE TABLE IF NOT EXISTS online (vid TEXT PRIMARY KEY, at INTEGER NOT NULL, page TEXT NOT NULL, site TEXT NOT NULL);
-- achievements earned by sending squads (count achievements come from the bests), and squads sent per player
CREATE TABLE IF NOT EXISTS ach (pid TEXT NOT NULL, k TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pid, k));
CREATE TABLE IF NOT EXISTS pstats (pid TEXT PRIMARY KEY, submits INTEGER NOT NULL DEFAULT 0);
