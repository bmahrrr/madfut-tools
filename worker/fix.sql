-- One-off data fixes, run on every deploy (each is safe to run again).
-- 17 Nov 2026: the Easy sets were remade, so scores on the old Easy puzzles go.
DELETE FROM scores WHERE set_id LIKE 'easy-%' AND at < '2026-11-17T14:10:00Z';
