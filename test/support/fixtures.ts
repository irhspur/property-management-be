// Fixture builders: plain functions that insert rows directly and return ids.
// They skip business rules on purpose (vacancy, duplicates, the period grid),
// so a fixture never fails because of a rule its test isn't about. Use the
// services only for the behaviour under test. Call them after
// useTestDatabase()'s before() has run, i.e. inside your own before() or a test.
import pool from '../../config/database';

const one = async (sql: string, params: unknown[] = []): Promise<any> => (await pool.query(sql, params)).rows[0];

export interface Lookups {
  property_type_id: number;
  country_id: number;
  province_id: number;
  district_id: number;
  municipality_id: number;
  agreement_duration_id: number; // 3 years
  increment_duration_id: number; // 1 year
  increment_percentage_id: number; // 10%
  file_category_id: number;
  property_file_category_id: number;
  agreement_file_category_id: number;
  signed_contract_id: number;
}

let cached: Lookups | null = null;

// Seeded lookup ids the fixtures need, read once per file.
export const lookups = async (): Promise<Lookups> => {
  cached ??= await one(`SELECT
    (SELECT MIN(id) FROM property_types) AS property_type_id,
    (SELECT MIN(id) FROM country) AS country_id,
    (SELECT MIN(id) FROM province) AS province_id,
    (SELECT MIN(id) FROM district) AS district_id,
    (SELECT MIN(id) FROM municipality) AS municipality_id,
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id,
    (SELECT id FROM increment_duration WHERE increment_duration_in_years = 1) AS increment_duration_id,
    (SELECT id FROM increment_percentage WHERE increment_percentage = 10) AS increment_percentage_id,
    (SELECT MIN(id) FROM file_categories) AS file_category_id,
    (SELECT MIN(id) FROM property_file_categories) AS property_file_category_id,
    (SELECT MIN(id) FROM agreement_file_categories) AS agreement_file_category_id,
    (SELECT id FROM agreement_file_categories WHERE code = 'signed_contract') AS signed_contract_id`);
  return cached!;
};

const USER_TYPES = { admin: 1, owner: 2, tenant: 3 } as const;
let emails = 0;

export interface UserOptions {
  first?: string;
  middle?: string | null;
  last?: string;
  mobile?: string | null;
  photoPath?: string | null;
}

// A verified, active user with a user_details row.
export const user = async (type: keyof typeof USER_TYPES, opts: UserOptions = {}): Promise<string> => {
  const { user_id } = await one(
    `INSERT INTO users (email, password, user_type_id, is_verified, profile_photo_path)
     VALUES ($1, 'x', $2, TRUE, $3) RETURNING user_id`,
    [`${type}.${process.pid}.${Date.now()}.${++emails}@fixture.test`, USER_TYPES[type], opts.photoPath ?? null]
  );
  await pool.query(
    `INSERT INTO user_details (user_id, first_name, middle_name, last_name, mobile_number) VALUES ($1, $2, $3, $4, $5)`,
    [user_id, opts.first ?? type, opts.middle ?? null, opts.last ?? 'Fixture', opts.mobile ?? null]
  );
  return user_id;
};

export const admin = (opts: UserOptions = {}) => user('admin', opts);
export const owner = (opts: UserOptions = {}) => user('owner', { first: 'Owner', last: 'Test', ...opts });

// A Tenant, linked to `linkedTo` by an Ownership Link when given.
export const tenant = async (opts: UserOptions & { linkedTo?: string } = {}): Promise<string> => {
  const id = await user('tenant', opts);
  if (opts.linkedTo) await link(opts.linkedTo, id);
  return id;
};

export const link = async (ownerId: string, tenantId: string): Promise<void> => {
  await pool.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);
};

export const property = async (
  ownerId: string,
  opts: { name?: string; street?: string; ward?: number; vacant?: boolean } = {}
): Promise<string> => {
  const l = await lookups();
  const { property_id } = await one(
    `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
       ward_number, street_name, house_number, property_name, is_vacant)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1', $9, $10) RETURNING property_id`,
    [ownerId, l.property_type_id, l.country_id, l.province_id, l.district_id, l.municipality_id,
      opts.ward ?? 1, opts.street ?? 'Test Street', opts.name ?? 'Test House', opts.vacant ?? true]
  );
  return property_id;
};

export interface AgreementOptions {
  property: string;
  tenant: string;
  start?: string;
  end?: string | null;
  status?: 'active' | 'ended';
  rent?: number;
  periodId?: number; // 1 monthly, 2 quarterly, 3 half-yearly, 4 yearly
  increments?: boolean; // 10% every year
  deposit?: number | null;
  createdAt?: string;
}

export const agreement = async (opts: AgreementOptions): Promise<{ agreement_id: string; agreement_reference: string }> => {
  const l = await lookups();
  return one(
    `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount, security_deposit,
       agreement_duration_id, payment_period_id, increment_duration_id, increment_percentage_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamp, CURRENT_TIMESTAMP))
     RETURNING agreement_id, agreement_reference`,
    [opts.property, opts.tenant, opts.start ?? '2025-01-15', opts.end ?? null, opts.rent ?? 10000, opts.deposit ?? null,
      l.agreement_duration_id, opts.periodId ?? 1, opts.increments ? l.increment_duration_id : null,
      opts.increments ? l.increment_percentage_id : null, opts.status ?? 'active', opts.createdAt ?? null]
  );
};

export const payment = async (
  agreementId: string,
  opts: { purpose?: number; method?: number; amount?: number; paidOn?: string; covers?: string | null; remarks?: string | null } = {}
): Promise<string> =>
  (
    await one(
      `INSERT INTO payments (agreement_id, payment_purpose_id, payment_method_id, amount, paid_on, covers_period_start, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING payment_id`,
      [agreementId, opts.purpose ?? 1, opts.method ?? 1, opts.amount ?? 10000, opts.paidOn ?? '2025-01-20',
        opts.covers === undefined ? '2025-01-15' : opts.covers, opts.remarks ?? null]
    )
  ).payment_id;

// A Document row. Pass user_id plus whatever places it: file_category_id for a
// Personal Document, property_id + property_file_category_id, agreement_id +
// agreement_file_category_id, or payment_id. The bytes aren't written.
export const document = async (cols: { user_id: string; file_path?: string } & Record<string, unknown>): Promise<string> => {
  const all = { file_path: 'uploads/none/x.pdf', ...cols };
  const names = Object.keys(all);
  return (
    await one(
      `INSERT INTO files (${names.join(', ')}, original_name, mimetype, file_size, file_name)
       VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, 'x.pdf', 'application/pdf', 4, 'x.pdf')
       RETURNING file_id`,
      Object.values(all)
    )
  ).file_id;
};
