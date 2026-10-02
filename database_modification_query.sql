ALTER TABLE user_details ADD COLUMN IF NOT EXISTS birth_province_id INTEGER REFERENCES province(id) ON DELETE SET NULL;

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

-- Agreement entity (ADR-0004): Tenant + Property + terms. Creation requires a
-- pre-existing Ownership Link (enforced at the service layer, not here — see
-- ownerTenant model). A Property or Tenant may have at most one active
-- Agreement at a time; the partial unique indexes below enforce that
-- invariant at the DB level as a backstop to the application-level check.
CREATE TABLE IF NOT EXISTS agreements (
  agreement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  rent_amount DECIMAL(15, 2) NOT NULL,
  security_deposit DECIMAL(15, 2),
  payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(property_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS agreements_one_active_per_property
  ON agreements (property_id) WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS agreements_one_active_per_tenant
  ON agreements (tenant_id) WHERE status = 'active';

-- Agreement rent-term detail (grill session 2026-08-17): agreement duration,
-- payment period, and rent increment terms move onto the pre-existing
-- agreement_duration / increment_duration / increment_percentage /
-- payment_period lookup tables (bounded-choice fields use FK lookups
-- throughout this codebase), and advance_amount is added as a field distinct
-- from security_deposit. Rent increment is recorded only — see CONTEXT.md.
CREATE TABLE IF NOT EXISTS agreement_duration (
  id SMALLINT PRIMARY KEY,
  duration_in_years SMALLINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS increment_duration (
  id SMALLINT PRIMARY KEY,
  increment_duration_in_years SMALLINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS increment_percentage (
  id SMALLINT PRIMARY KEY,
  increment_percentage DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_period (
  id SMALLINT PRIMARY KEY,
  payment_period VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS agreement_duration_id SMALLINT NOT NULL REFERENCES agreement_duration(id);
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS payment_period_id SMALLINT NOT NULL REFERENCES payment_period(id);
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS increment_duration_id SMALLINT REFERENCES increment_duration(id);
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS increment_percentage_id SMALLINT REFERENCES increment_percentage(id);
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(15, 2);
ALTER TABLE agreements DROP COLUMN IF EXISTS payment_frequency;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agreements_increment_terms_together'
  ) THEN
    ALTER TABLE agreements ADD CONSTRAINT agreements_increment_terms_together
      CHECK ((increment_duration_id IS NULL) = (increment_percentage_id IS NULL));
  END IF;
END $$;

-- Payment entity (grill session 2026-08-22; ADR-0005, ADR-0006, ADR-0007): a
-- Payment always belongs to exactly one Agreement — Property and Tenant are
-- derived through it, never recorded independently. See CONTEXT.md "Payment".

CREATE TABLE IF NOT EXISTS payment_purpose (
  id SMALLINT PRIMARY KEY,
  payment_purpose VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_method (
  id SMALLINT PRIMARY KEY,
  payment_method VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bikram Sambat calendar reference (ADR-0006). Direct BS-month -> AD-date
-- lookup, seeded from a vetted almanac table (data/bs_month.csv), not
-- computed — BS month lengths (29-32 days) have no closed-form formula.
-- Covers BS 2000-2090 (~AD 1943-2034); extend the seed data, never derive.
CREATE TABLE IF NOT EXISTS bs_month (
  id SERIAL PRIMARY KEY,
  bs_year SMALLINT NOT NULL,
  bs_month SMALLINT NOT NULL CHECK (bs_month BETWEEN 1 AND 12),
  month_name VARCHAR(20) NOT NULL,
  ad_start_date DATE NOT NULL,
  days SMALLINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bs_year, bs_month)
);
CREATE INDEX IF NOT EXISTS bs_month_ad_start_date_idx ON bs_month (ad_start_date);

-- payment_reference is a second, human-readable identifier alongside the UUID
-- PK (grill session 2026-08-22) — payments get read aloud and quoted, unlike
-- every other entity in this schema.
CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_reference BIGSERIAL UNIQUE NOT NULL,
  agreement_id UUID NOT NULL,
  payment_purpose_id SMALLINT NOT NULL,
  payment_method_id SMALLINT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL,
  -- Required for rent only; NULL for every other purpose (ADR-0007). Not a
  -- CHECK here — enforcing "purpose = rent" in DDL would hardcode a lookup
  -- id; enforced in paymentService instead, same posture as ADR-0004 took
  -- for the Ownership Link precondition.
  covers_period_start DATE,
  remarks VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agreement_id) REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  FOREIGN KEY (payment_purpose_id) REFERENCES payment_purpose(id),
  FOREIGN KEY (payment_method_id) REFERENCES payment_method(id)
);
CREATE INDEX IF NOT EXISTS payments_agreement_paid_on_idx ON payments (agreement_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS payments_agreement_period_idx ON payments (agreement_id, covers_period_start);

-- Activity Event log (ADR-0008): append-only, written in the same transaction
-- as the mutation it records, so deletions and true "ended" moments survive.
-- subject_id deliberately has no FK — the event must outlive its subject.
-- context is denormalised ({ property_name, tenant_name, amount }) so the
-- feed renders without follow-up lookups and after the subject is gone.
-- occurred_at is truncated to milliseconds so the keyset cursor round-trips
-- exactly through a JS Date.
CREATE TABLE IF NOT EXISTS activity_event (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  subject_kind VARCHAR(20) NOT NULL,
  subject_id UUID NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now())
);
CREATE INDEX IF NOT EXISTS activity_event_owner_feed_idx
  ON activity_event (owner_id, occurred_at DESC, event_id DESC);

-- One-off backfill from existing rows so the feed isn't empty on first
-- deploy. Idempotent: each insert skips (type, subject_id) pairs already
-- logged. Deletions before this point are unrecoverable. agreement.ended
-- uses updated_at as the best available timestamp — accurate for rows whose
-- last write was the end action, which is every write the API allows today.
INSERT INTO activity_event (owner_id, type, subject_kind, subject_id, context, occurred_at)
SELECT p.user_id, 'property.created', 'property', p.property_id,
       jsonb_build_object('property_name', p.property_name, 'tenant_name', NULL, 'amount', NULL),
       date_trunc('milliseconds', p.created_at AT TIME ZONE current_setting('TimeZone'))
FROM properties p
WHERE NOT EXISTS (SELECT 1 FROM activity_event e WHERE e.type = 'property.created' AND e.subject_id = p.property_id);

INSERT INTO activity_event (owner_id, type, subject_kind, subject_id, context, occurred_at)
SELECT ot.property_owner_id, 'tenant.linked', 'tenant', ot.tenant_id,
       jsonb_build_object('property_name', NULL,
                          'tenant_name', NULLIF(concat_ws(' ', ud.first_name, ud.last_name), ''),
                          'amount', NULL),
       date_trunc('milliseconds', ot.created_at AT TIME ZONE current_setting('TimeZone'))
FROM owner_tenant ot
LEFT JOIN user_details ud ON ud.user_id = ot.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM activity_event e
  WHERE e.type = 'tenant.linked' AND e.subject_id = ot.tenant_id AND e.owner_id = ot.property_owner_id
);

INSERT INTO activity_event (owner_id, type, subject_kind, subject_id, context, occurred_at)
SELECT p.user_id, ev.type, 'agreement', a.agreement_id,
       jsonb_build_object('property_name', p.property_name,
                          'tenant_name', NULLIF(concat_ws(' ', ud.first_name, ud.last_name), ''),
                          'amount', NULL),
       date_trunc('milliseconds', ev.at AT TIME ZONE current_setting('TimeZone'))
FROM agreements a
JOIN properties p ON p.property_id = a.property_id
LEFT JOIN user_details ud ON ud.user_id = a.tenant_id
CROSS JOIN LATERAL (
  VALUES ('agreement.created', a.created_at), ('agreement.ended', a.updated_at)
) AS ev(type, at)
WHERE (ev.type = 'agreement.created' OR a.status = 'ended')
  AND NOT EXISTS (SELECT 1 FROM activity_event e WHERE e.type = ev.type AND e.subject_id = a.agreement_id);

INSERT INTO activity_event (owner_id, type, subject_kind, subject_id, context, occurred_at)
SELECT p.user_id, 'payment.recorded', 'payment', pay.payment_id,
       jsonb_build_object('property_name', p.property_name,
                          'tenant_name', NULLIF(concat_ws(' ', ud.first_name, ud.last_name), ''),
                          'amount', pay.amount),
       date_trunc('milliseconds', pay.created_at AT TIME ZONE current_setting('TimeZone'))
FROM payments pay
JOIN agreements a ON a.agreement_id = pay.agreement_id
JOIN properties p ON p.property_id = a.property_id
LEFT JOIN user_details ud ON ud.user_id = a.tenant_id
WHERE NOT EXISTS (SELECT 1 FROM activity_event e WHERE e.type = 'payment.recorded' AND e.subject_id = pay.payment_id);

-- Agreement list filters (status, ending_before) — the dashboard expiry card.
CREATE INDEX IF NOT EXISTS agreements_status_end_date_idx ON agreements (status, end_date);

-- Optional descriptive Property fields (Add Property redesign). All NULL for
-- existing rows. Land area is stored once in sq ft; land_area_unit records
-- which system (Ropani or Bigha) the owner entered it in so the form can show
-- it back. year_built_bs is a plain BS year, not a date. The application
-- validates the same ranges and returns 400; the checks below are a backstop.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS land_area_sqft  NUMERIC(16,6) NULL CHECK (land_area_sqft > 0),
  ADD COLUMN IF NOT EXISTS land_area_unit  VARCHAR(10)   NULL CHECK (land_area_unit IN ('ropani','bigha')),
  ADD COLUMN IF NOT EXISTS number_of_units SMALLINT      NULL CHECK (number_of_units BETWEEN 1 AND 999),
  ADD COLUMN IF NOT EXISTS year_built_bs   SMALLINT      NULL CHECK (year_built_bs >= 1900),
  ADD COLUMN IF NOT EXISTS latitude        NUMERIC(9,6)  NULL CHECK (latitude  BETWEEN -90  AND 90),
  ADD COLUMN IF NOT EXISTS longitude       NUMERIC(9,6)  NULL CHECK (longitude BETWEEN -180 AND 180);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_area_unit_pair') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_area_unit_pair
      CHECK ((land_area_sqft IS NULL) = (land_area_unit IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_lat_lng_pair') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_lat_lng_pair
      CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END $$;

-- Profile photo (My Tenants redesign). On users, not user_details, so the same
-- column can later hold property owner avatars. Kept apart from Documents:
-- a photo shows on every list row, identity documents only on the detail page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(255) NULL;

-- Tenant list default order and the dashboard's tenants.added_this_month.
CREATE INDEX IF NOT EXISTS owner_tenant_owner_created_idx
  ON owner_tenant (property_owner_id, created_at DESC);

-- Stable `code` on file categories (frontend uploads into categories by code,
-- not by an editable name). Seed codes are mapped by id AND name, so an
-- environment seeded differently gets `category_<id>` rather than a wrong
-- reserved code; check for those and fix them by hand. Reserved codes live in
-- config/categoryCodes.js. The name typo fixes run after mapping, since the
-- mapping matches the old names.
ALTER TABLE file_categories ADD COLUMN IF NOT EXISTS code VARCHAR(40);
UPDATE file_categories fc SET code = v.code
FROM (VALUES
  (1, 'Photo', 'photo'),
  (2, 'Citizenship (Front)', 'citizenship_front'),
  (3, 'Citizenship (Back)', 'citizenship_back'),
  (4, 'Driving Lisence', 'driving_license'),
  (5, 'Passport', 'passport')
) AS v(id, name, code)
WHERE fc.id = v.id AND fc.name = v.name AND fc.code IS NULL;
UPDATE file_categories SET code = 'category_' || id WHERE code IS NULL;
UPDATE file_categories SET name = 'Driving License', updated_at = NOW()
WHERE code = 'driving_license' AND name = 'Driving Lisence';
ALTER TABLE file_categories ALTER COLUMN code SET NOT NULL;

ALTER TABLE property_file_categories ADD COLUMN IF NOT EXISTS code VARCHAR(40);
UPDATE property_file_categories pfc SET code = v.code
FROM (VALUES
  (1, 'Lalpurja', 'lalpurja'),
  (3, 'Picture Of Property', 'property_photo'),
  (4, 'Any Other Relevent Document', 'other'),
  (5, 'Map/Naxa Of Property', 'naxa')
) AS v(id, name, code)
WHERE pfc.id = v.id AND pfc.name = v.name AND pfc.code IS NULL;
UPDATE property_file_categories SET code = 'category_' || id WHERE code IS NULL;
UPDATE property_file_categories SET name = 'Any Other Relevant Document', updated_at = NOW()
WHERE code = 'other' AND name = 'Any Other Relevent Document';
ALTER TABLE property_file_categories ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_categories_code_key') THEN
    ALTER TABLE file_categories ADD CONSTRAINT file_categories_code_key UNIQUE (code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_categories_code_format') THEN
    ALTER TABLE file_categories ADD CONSTRAINT file_categories_code_format
      CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_file_categories_code_key') THEN
    ALTER TABLE property_file_categories ADD CONSTRAINT property_file_categories_code_key UNIQUE (code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_file_categories_code_format') THEN
    ALTER TABLE property_file_categories ADD CONSTRAINT property_file_categories_code_format
      CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$');
  END IF;
END $$;
