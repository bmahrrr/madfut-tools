-- Puzzles leaderboard. players: one per name (unique, any case), PIN stored as a salted hash, wrong-PIN lockout.
-- tokens: a sign-in per device. scores: each player's best per puzzle, with the squad.
CREATE TABLE IF NOT EXISTS players (pid TEXT PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, pid TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tokens_pid ON tokens (pid);
CREATE TABLE IF NOT EXISTS scores (pid TEXT NOT NULL, puzzle TEXT NOT NULL, set_id TEXT NOT NULL, pts INTEGER NOT NULL, chem INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 0, team TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pid, puzzle));
CREATE INDEX IF NOT EXISTS scores_set ON scores (set_id);
CREATE INDEX IF NOT EXISTS scores_puzzle ON scores (puzzle, pts);
