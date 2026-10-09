// Payment Statement improvements (statement spec, items 1-4). Runs against
// the database in .env, migrated, with lookup tables seeded. All fixtures are
// created inside one transaction that is rolled back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as paymentService from '../services/paymentService';
import * as agreementService from '../services/agreementService';
import { today, addDays, monthOf } from '../utils/businessDate';
import { currentFiscalYear, toBs } from '../utils/nepaliCalendar';

const BASE_URL = 'http://test';
const RENT = 1;
let client: PoolClient;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let endedTenantId: string;
let activeId: string;
let endedId: string;

const t = today();
const lastMonth = monthOf(t, -1).from;

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
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id`);

  const user = async (key: string, userTypeId: number) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
      [`${key}.${Date.now()}@payment-statement.test`, userTypeId]
    );
    await client.query(`INSERT INTO user_details (user_id, first_name, last_name) VALUES ($1, $2, 'Statement')`, [
      user_id,
      key,
    ]);
    return user_id as string;
  };
  ownerId = await user('owner', 2);
  otherOwnerId = await user('other', 2);
  tenantId = await user('tenant', 3);
  endedTenantId = await user('ended', 3);
  for (const id of [tenantId, endedTenantId]) {
    await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, id]);
  }

  const agreement = async (tenant: string, start: string, end: string | null, status: string) => {
    const { property_id } = await one(
      `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
         ward_number, street_name, house_number, property_name)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'Street', '1', 'Statement House') RETURNING property_id`,
      [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
        lookups.municipality_id]
    );
    return (
      await one(
        `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount,
           agreement_duration_id, payment_period_id, status)
         VALUES ($1, $2, $3, $4, 10000, $5, 1, $6) RETURNING agreement_id`,
        [property_id, tenant, start, end, lookups.agreement_duration_id, status]
      )
    ).agreement_id as string;
  };
  // Monthly from the 1st, 14 months back: spans this and the previous FY.
  activeId = await agreement(tenantId, monthOf(t, -14).from, null, 'active');
  endedId = await agreement(endedTenantId, '2025-01-15', '2025-06-30', 'ended');

  const pay = (paidOn: string, covers: string, amount: number, method: number, remarks: string | null) =>
    client.query(
      `INSERT INTO payments (agreement_id, payment_purpose_id, payment_method_id, amount, paid_on,
         covers_period_start, remarks)
       VALUES ($1, ${RENT}, $2, $3, $4, $5, $6)`,
      [activeId, method, amount, paidOn, covers, remarks]
    );
  // Last month's period settled in two parts; the later one is listed first.
  await pay(addDays(lastMonth, 2), lastMonth, 4000, 1, 'first half');
  await pay(addDays(lastMonth, 9), lastMonth, 6000, 2, null);
  await pay(t, monthOf(t).from, 10000, 1, 'on time');
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
});

test('payment entries carry method, remarks, BS date and receipt count, newest first', async () => {
  const s = await paymentService.getStatement(ownerId, tenantId, activeId);
  const period = s.periods.find((p: any) => p.period_start === lastMonth);
  assert.equal(period.status, 'paid');
  assert.deepEqual(
    period.payments.map((p: any) => [p.paid_on, p.payment_method_id, p.remarks, p.amount, p.receipt_count]),
    [
      [addDays(lastMonth, 9), 2, null, 6000, 0],
      [addDays(lastMonth, 2), 1, 'first half', 4000, 0],
    ]
  );
  for (const p of period.payments) {
    assert.equal(typeof p.payment_method, 'string');
    assert.deepEqual(p.paid_on_bs, await toBs(p.paid_on));
  }
});

test('lifetime_arrears matches /arrears, whatever the fiscal year', async () => {
  const fy = await currentFiscalYear();
  const current = await paymentService.getStatement(ownerId, tenantId, activeId, fy);
  const previous = await paymentService.getStatement(ownerId, tenantId, activeId, fy - 1);
  assert.equal(current.lifetime_arrears, previous.lifetime_arrears);

  const { items } = await paymentService.getArrears(ownerId, { tenantId });
  const item = items.find((i) => i.agreement_id === activeId);
  assert.ok(item);
  assert.equal(current.lifetime_arrears, item.outstanding);
  // 15 periods due, 2 of them paid.
  assert.equal(current.lifetime_arrears, 13 * 10000);
});

test('an ended agreement keeps its arrears: on the Statement and in Portfolio Arrears', async () => {
  const s = await paymentService.getStatement(ownerId, endedTenantId, endedId, 2081);
  // Jan 15 – Jun 30 2025: six monthly periods, none paid.
  assert.equal(s.lifetime_arrears, 60000);

  // Ending the Agreement doesn't forgive the debt (GLOSSARY.md "Portfolio Arrears").
  const { items, total_outstanding } = await paymentService.getArrears(ownerId, { tenantId: endedTenantId });
  assert.equal(items.length, 1);
  assert.equal(items[0].agreement_id, endedId);
  assert.equal(items[0].agreement_status, 'ended');
  assert.equal(items[0].outstanding, s.lifetime_arrears);
  assert.equal(total_outstanding, 60000);
  // No increments accrue after move-out: rent stays at the last period's.
  assert.equal(items[0].rent_in_force, 10000);
});

test('statement by agreement id: same payload, 404 for another owner or a malformed id', async () => {
  const fy = await currentFiscalYear();
  assert.deepEqual(
    await paymentService.getStatementByAgreementId(ownerId, activeId, fy),
    await paymentService.getStatement(ownerId, tenantId, activeId, fy)
  );
  await assert.rejects(paymentService.getStatementByAgreementId(otherOwnerId, activeId), { statusCode: 404 });
  await assert.rejects(paymentService.getStatementByAgreementId(ownerId, 'not-a-uuid'), { statusCode: 404 });
  await assert.rejects(paymentService.getStatementByAgreementId(ownerId, activeId, 1.5), { statusCode: 400 });
});

test('agreement detail: rent_in_force_today and is_expiring match the list row, one current step', async () => {
  const { data } = await agreementService.getAgreementsByOwner(ownerId, BASE_URL);
  for (const id of [activeId, endedId]) {
    const listed = data.find((r) => r.agreement_id === id)!;
    const detail = await agreementService.getAgreementById(ownerId, id, BASE_URL);
    assert.equal(detail.rent_in_force_today, listed.rent_in_force_today);
    assert.equal(detail.is_expiring, listed.is_expiring);
    assert.equal(detail.rent_schedule.filter((s: any) => s.current).length, 1);
  }
  const ended = await agreementService.getAgreementById(ownerId, endedId, BASE_URL);
  // Past its end: the last step is current.
  assert.equal(ended.rent_schedule[ended.rent_schedule.length - 1].current, true);
});
