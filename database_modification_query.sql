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
