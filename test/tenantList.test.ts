// Tenant list tenancy summary vs the dashboard (My Tenants spec, item 3).
// Runs against the database in .env, migrated, with lookup tables seeded. All
// fixtures are created inside one transaction that is rolled back, so the
// database is left as it was.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as dashboardService from '../services/dashboardService';
import * as tenantService from '../services/tenantService';
import { today, addDays } from '../utils/businessDate';

const BASE_URL = 'http://test';
let client: PoolClient;
let ownerId: string;
const tenants: Record<string, string> = {};

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

before(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  // Route every model query through this transaction.
  (pool as any).query = client.query.bind(client);

  const lookups = await one(`SELECT
    (SELECT MIN(id) FROM property_types) AS property_type_id,
    (SELECT MIN(id) FROM country) AS country_id,
    (SELECT MIN(id) FROM province) AS province_id,
    (SELECT MIN(id) FROM district) AS district_id,
    (SELECT MIN(id) FROM municipality) AS municipality_id,
    (SELECT MIN(id) FROM agreement_duration) AS agreement_duration_id,
    (SELECT MIN(id) FROM payment_period) AS payment_period_id`);

  const user = async (key: string, userTypeId: number, first: string, middle: string | null, last: string) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified)
       VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
      [`${key}.${Date.now()}@tenant-list.test`, userTypeId]
    );
    await client.query(
      `INSERT INTO user_details (user_id, first_name, middle_name, last_name) VALUES ($1, $2, $3, $4)`,
      [user_id, first, middle, last]
    );
    return user_id as string;
  };

  ownerId = await user('owner', 2, 'Owner', null, 'Test');
  const specs: [string, string, string | null, string][] = [
    ['open', 'Arjun', 'Bahadur', 'Koirala'],
    ['soon', 'Sita', null, 'Sharma'],
    ['overdue', 'Hari', null, 'Thapa'],
    ['ended', 'Gita', null, 'Rai'],
    ['none', 'Ram', null, '100%_Literal'],
    ['second', 'Maya', null, 'Gurung'],
  ];
  for (const [key, first, middle, last] of specs) {
    tenants[key] = await user(key, 3, first, middle, last);
    await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenants[key]]);
  }

  const todayStr = today();
  const agreement = async (tenantKey: string, endDate: string | null, status: 'active' | 'ended') => {
    const { property_id } = await one(
      `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
         ward_number, street_name, house_number, property_name, is_vacant)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'Test Street', '1', $7, $8) RETURNING property_id`,
      [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
        lookups.municipality_id, `House ${tenantKey}`, status !== 'active']
    );
    await client.query(
      `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount,
         agreement_duration_id, payment_period_id, status)
       VALUES ($1, $2, $3, $4, 10000, $5, $6, $7)`,
      [property_id, tenants[tenantKey], addDays(todayStr, -400), endDate, lookups.agreement_duration_id,
        lookups.payment_period_id, status]
    );
  };
  await agreement('open', null, 'active');
  await agreement('soon', addDays(todayStr, 10), 'active');
  await agreement('overdue', addDays(todayStr, -5), 'active');
  await agreement('ended', addDays(todayStr, -30), 'ended');
  await agreement('second', addDays(todayStr, 31), 'active');
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
});

const statusOf = (rows: Record<string, any>[], key: string) =>
  rows.find((r) => r.tenant_id === tenants[key])?.tenancy?.status ?? null;

test('tenancy status follows the agreement and the 30-day expiring rule', async () => {
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  assert.equal(statusOf(data, 'open'), 'active');
  assert.equal(statusOf(data, 'soon'), 'expiring');
  assert.equal(statusOf(data, 'overdue'), 'expiring');
  assert.equal(statusOf(data, 'ended'), 'ended');
  assert.equal(statusOf(data, 'second'), 'active');
  assert.equal(data.find((r) => r.tenant_id === tenants.none)?.tenancy, null);
});

test('dashboard tenants.active equals tenants with status active or expiring', async () => {
  const dashboard = await dashboardService.getDashboard(ownerId);
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  const holding = data.filter((r) => r.tenancy?.status === 'active' || r.tenancy?.status === 'expiring');
  assert.equal(holding.length, 4);
  assert.equal(dashboard.tenants.active, holding.length);
  assert.equal(dashboard.tenants.added_this_month, 6);
});

test('status filter matches tenancy.status, and none means no tenancy', async () => {
  for (const status of ['active', 'expiring', 'ended'] as const) {
    const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { status });
    assert.ok(data.length > 0);
    assert.ok(data.every((r) => r.tenancy?.status === status), status);
  }
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { status: 'none' });
  assert.deepEqual(data.map((r) => r.tenant_id), [tenants.none]);
});

test('q matches full name with middle name, property name, and treats % and _ literally', async () => {
  const byName = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'arjun koirala' });
  assert.deepEqual(byName.data.map((r) => r.tenant_id), [tenants.open]);
  const byFullName = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'ARJUN BAHADUR' });
  assert.deepEqual(byFullName.data.map((r) => r.tenant_id), [tenants.open]);
  const byProperty = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'house soon' });
  assert.deepEqual(byProperty.data.map((r) => r.tenant_id), [tenants.soon]);
  const literal = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: '100%_' });
  assert.deepEqual(literal.data.map((r) => r.tenant_id), [tenants.none]);
  const wildcard = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: '%' });
  assert.deepEqual(wildcard.data.map((r) => r.tenant_id), [tenants.none]);
});

test('paging returns the full total, and an offset past the end returns no rows', async () => {
  const all = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  const page = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { limit: 2, offset: 2 });
  assert.equal(page.total, 6);
  assert.deepEqual(page.data.map((r) => r.tenant_id), all.data.slice(2, 4).map((r) => r.tenant_id));
  const past = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { limit: 10, offset: 50 });
  assert.deepEqual(past.data, []);
  assert.equal(past.total, 6);
});

test('rows carry profile_photo_url, never the stored path', async () => {
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  assert.ok(data.every((r) => r.profile_photo_url === null && !('profile_photo_path' in r)));
  await client.query(`UPDATE users SET profile_photo_path = 'uploads/x/p.jpg' WHERE user_id = $1`, [tenants.open]);
  const tenant = await tenantService.getTenant(ownerId, tenants.open, BASE_URL);
  assert.match(tenant.profile_photo_url, /^http:\/\/test\/files\/view\/.+/);
  assert.equal(tenant.tenancy.status, 'active');
});
