ALTER TABLE user_details ADD COLUMN IF NOT EXISTS birth_province_id INTEGER REFERENCES province(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS municipality_copy (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  district_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES district(id) ON DELETE CASCADE
);

SELECT setval('municipality_copy_id_seq', (SELECT MAX(id) FROM municipality_copy) + 1);

COPY municipality_copy(id, name, district_id)
FROM 'F:/VSCODE/proptrove.io/data/grok.csv'
DELIMITER ','
CSV HEADER;

SELECT setval('municipality_id_seq', (SELECT MAX(id) FROM municipality) + 1);

INSERT INTO municipality (name, district_id, created_at, updated_at)
SELECT name, district_id, created_at, updated_at
FROM municipality_copy
WHERE district_id NOT IN (1, 12);

-- Fix duplicate user_details rows: upsert() was check-then-act with no unique
-- constraint or locking, so concurrent calls could both insert for the same
-- user_id. This produced duplicate rows in files-list queries that JOIN
-- user_details. Keep the most recently created row per user_id, then enforce
-- one-to-one going forward.
DELETE FROM user_details a
USING user_details b
WHERE a.user_id = b.user_id
  AND (a.created_at, a.user_details_id) < (b.created_at, b.user_details_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_details_user_id_unique'
  ) THEN
    ALTER TABLE user_details ADD CONSTRAINT user_details_user_id_unique UNIQUE (user_id);
  END IF;
END $$;