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