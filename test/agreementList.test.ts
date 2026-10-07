// Agreements list (agreements list spec, items 1-5, 7, 8). Runs against the
// database in .env, migrated, with lookup tables seeded. All fixtures are
// created inside one transaction that is rolled back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as agreementService from '../services/agreementService';
import * as dashboardService from '../services/dashboardService';
import { today, addDays } from '../utils/businessDate';

const BASE_URL = 'http://test';
let client: PoolClient;
let ownerId: string;
const ids: Record<string, string> = {};
const refs: Record<string, string> = {};

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

before(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  (pool as any).query = client.query.bind(client);

  const lookups = await one(`SELECT
    (SELECT MIN(id) FROM property_types) AS property_type_id,
    (SELECT MIN(id) FROM country) AS country_id,
    (SELECT MIN(id) FROM province) AS province_id,
    (SELECT MIN(id) FROM district) AS district_id,
    (SELECT MIN(id) FROM municipality) AS municipality_id,
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id,
    (SELECT id FROM increment_duration WHERE increment_duration_in_years = 1) AS increment_duration_id,
    (SELECT id FROM increment_percentage WHERE increment_percentage = 10) AS increment_percentage_id`);

  const user = async (key: string, userTypeId: number, first: string, last: string, mobile: string | null) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified, profile_photo_path)
       VALUES ($1, 'x', $2, TRUE, $3) RETURNING user_id`,
      [`${key}.${Date.now()}@agreement-list.test`, userTypeId, key === 'photo' ? 'uploads/x/p.jpg' : null]
    );
    await client.query(
      `INSERT INTO user_details (user_id, first_name, last_name, mobile_number) VALUES ($1, $2, $3, $4)`,
      [user_id, first, last, mobile]
    );
    return user_id as string;
  };
  ownerId = await user('owner', 2, 'Owner', 'List', null);

  const t = today();
  // key, tenant name, mobile, property, start, end, status, rent, period id, increment?, deposit, created_at
  const specs: [string, string, string, string, string, string | null, string, number, number, boolean, number | null, string][] = [
    ['open', 'Arjun Koirala', '9811111111', 'Durbar House', addDays(t, -400), null, 'active', 20000, 1, true, 50000, addDays(t, -400)],
    ['soon', 'Sita Sharma', '9822222222', 'Lake View', addDays(t, -100), addDays(t, 10), 'active', 30000, 1, false, 100000, addDays(t, -100)],
    ['overdue', 'Hari Thapa', '9833333333', 'Hill Top', addDays(t, -800), addDays(t, -5), 'active', 12000, 2, false, null, addDays(t, -800)],
    ['photo', 'Gita Rai', '9844444444', 'Old Mill', addDays(t, -900), addDays(t, -30), 'ended', 9000, 1, false, 20000, addDays(t, -900)],
  ];
  for (const [key, name, mobile, propertyName, start, end, status, rent, periodId, increment, deposit, createdAt] of specs) {
    const [first, last] = name.split(' ');
    const tenantId = await user(key, 3, first, last, mobile);
    const { property_id } = await one(
      `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
         ward_number, street_name, house_number, property_name)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'Street', '1', $7) RETURNING property_id`,
      [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
        lookups.municipality_id, propertyName]
    );
    const row = await one(
      `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount, security_deposit,
         agreement_duration_id, payment_period_id, increment_duration_id, increment_percentage_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING agreement_id, agreement_reference`,
      [property_id, tenantId, start, end, rent, deposit, lookups.agreement_duration_id, periodId,
        increment ? lookups.increment_duration_id : null, increment ? lookups.increment_percentage_id : null,
        status, createdAt]
    );
    ids[key] = row.agreement_id;
    refs[key] = row.agreement_reference;
  }
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
});

const list = (query: agreementService.AgreementListQuery = {}) =>
  agreementService.getAgreementsByOwner(ownerId, BASE_URL, query);
const keysOf = (rows: Record<string, any>[]) =>
  rows.map((r) => Object.keys(ids).find((k) => ids[k] === r.agreement_id));

test('without limit: the full list, no paging fields', async () => {
  const result = await list();
  assert.equal(result.data.length, 4);
  assert.ok(!('total' in result));
});

test('search: property, tenant name, mobile and agreement reference', async () => {
  assert.deepEqual(keysOf((await list({ q: 'durbar' })).data), ['open']);
  assert.deepEqual(keysOf((await list({ q: 'sita sharma' })).data), ['soon']);
  assert.deepEqual(keysOf((await list({ q: '98333' })).data), ['overdue']);
  assert.deepEqual(keysOf((await list({ q: `AGR-${refs.photo}` })).data), ['photo']);
  assert.deepEqual(keysOf((await list({ q: `#agr${refs.photo}` })).data), ['photo']);
  assert.ok(keysOf((await list({ q: refs.photo })).data).includes('photo'));
  assert.deepEqual((await list({ q: '%' })).data, []);
});

test('status: expiring includes passed end dates; matches the dashboard counter', async () => {
  const expiring = await list({ status: 'expiring' });
  assert.deepEqual(keysOf(expiring.data).sort(), ['overdue', 'soon']);
  assert.ok(expiring.data.every((r) => r.is_expiring === true));
  assert.deepEqual(keysOf((await list({ status: 'ended' })).data), ['photo']);
  const all = (await list()).data;
  assert.equal(all.find((r) => r.agreement_id === ids.open)!.is_expiring, false);
  assert.equal(all.find((r) => r.agreement_id === ids.photo)!.is_expiring, false);
  const dashboard = await dashboardService.getDashboard(ownerId);
  assert.equal(dashboard.agreements.ending_within_30_days, expiring.data.length);
});

test('paging: total counts every match; offset past the end is empty', async () => {
  const page = await list({ limit: 2, offset: 1 });
  assert.equal(page.total, 4);
  assert.equal(page.data.length, 2);
  assert.deepEqual([page.limit, page.offset], [2, 1]);
  const past = await list({ limit: 2, offset: 10, status: 'active' });
  assert.deepEqual(past.data, []);
  assert.equal(past.total, 3);
});

test('sorts', async () => {
  assert.deepEqual(keysOf((await list()).data), ['soon', 'open', 'overdue', 'photo']);
  assert.deepEqual(keysOf((await list({ sort: 'ending_soonest' })).data), ['photo', 'overdue', 'soon', 'open']);
  const byRent = await list({ sort: 'rent_desc', limit: 2 });
  assert.deepEqual(keysOf(byRent.data), ['soon', 'open']);
  assert.equal(byRent.total, 4);
});

test('row fields: current rent, location, photo URL', async () => {
  const rows = (await list()).data;
  const open = rows.find((r) => r.agreement_id === ids.open)!;
  assert.equal(open.rent_in_force_today, 22000); // one 10% increment, 400 days in
  assert.ok(open.property_type && open.municipality && open.district);
  assert.equal(open.tenant_profile_photo_url, null);
  const photo = rows.find((r) => r.agreement_id === ids.photo)!;
  assert.match(photo.tenant_profile_photo_url, /^http:\/\/test\/files\/view\//);
  assert.ok(!('tenant_profile_photo_path' in photo));
});

test('summary', async () => {
  const s = await agreementService.getSummary(ownerId);
  assert.equal(s.total, 4);
  assert.equal(s.active, 3);
  assert.equal(s.ending_within_30_days, 2);
  assert.equal(s.security_deposit_total, 150000); // active only
  assert.equal(s.added_this_month, 0);
  // 22000 + 30000 monthly, plus 12000 quarterly / 3.
  assert.equal(s.monthly_rent_roll, 56000);
});
