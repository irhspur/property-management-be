// Tenant portal: a Tenant's own Agreements and Statements (/tenant, ticket 03).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';
import { today, addDays } from '../utils/businessDate';
import pool from '../config/database';

useTestDatabase();

const app = useApp((a) => {
  a.use('/tenant', require('../routes/tenantPortalRoutes'));
  a.use('/property-owner', require('../routes/agreementRoutes'));
  a.use('/property-owner', require('../routes/paymentRoutes'));
});

const ids: Record<string, string> = {};

// In a suite so it runs after useApp() has created its users.
describe('tenant portal: agreements', () => {
  before(async () => {
    const { owner, tenant } = app.ids;
    const on = async (name: string) => fixtures.property(owner, { name });
    // Ended, with ended_at: ordered by it.
    ids.endedEarly = (await fixtures.agreement({
      property: await on('Early'), tenant, start: '2024-01-15', end: '2025-06-30', status: 'ended', endedAt: '2025-07-01',
    })).agreement_id;
    // Ended before ended_at existed: ordered by end_date.
    ids.endedLate = (await fixtures.agreement({
      property: await on('Late'), tenant, start: '2025-01-15', end: '2025-12-31', status: 'ended',
    })).agreement_id;
    ids.active = (await fixtures.agreement({ property: await on('Now'), tenant, start: '2026-01-15' })).agreement_id;

    // Another Tenant of the same owner.
    const other = await fixtures.tenant({ linkedTo: owner });
    ids.others = (await fixtures.agreement({ property: await on('Theirs'), tenant: other })).agreement_id;
  });

  test('a Tenant lists only their own Agreements, active first, then most recently ended', async () => {
    const res = await app.call('GET', '/tenant/agreements', { as: 'tenant' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'AK');
    assert.deepEqual(
      res.body.data.map((a: any) => a.agreement_id),
      [ids.active, ids.endedLate, ids.endedEarly]
    );
  });

  test('list rows have the owner list row shape', async () => {
    const mine = await app.call('GET', '/tenant/agreements', { as: 'tenant' });
    const owners = await app.call('GET', `/property-owner/agreements?tenant_id=${app.ids.tenant}`, { as: 'owner' });
    const byId = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.agreement_id, r]));
    assert.deepEqual(byId(mine.body.data), byId(owners.body.data));
  });

  // A Tenant has one active Agreement at a time: make room for another.
  const endActive = () => pool.query(`UPDATE agreements SET status = 'ended' WHERE agreement_id = $1`, [ids.active]);

  test("the detail is the owner's payload, without audit names, plus the Next Due Date", async () => {
    const mine = await app.call('GET', `/tenant/agreement/${ids.active}`, { as: 'tenant' });
    const owners = await app.call('GET', `/property-owner/agreements/${ids.active}`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    const { next_due_date, next_due_date_bs, next_due_rent, ...rest } = mine.body.data;
    assert.deepEqual(rest, { ...owners.body.data, created_by_name: null, updated_by_name: null });

    // Monthly from 2026-01-15: the next 15th strictly after today.
    const t = today();
    const [y, m, d] = t.split('-').map(Number);
    const next = d < 15 ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
    assert.equal(next_due_date, `${next[0]}-${String(next[1]).padStart(2, '0')}-15`);
    assert.equal(next_due_rent, 10000);
    assert.equal(typeof next_due_date_bs.bs_year, 'number');
  });

  test('before start_date the Next Due Date is the first period', async () => {
    await endActive();
    const start = addDays(today(), 40);
    const { agreement_id } = await fixtures.agreement({
      property: await fixtures.property(app.ids.owner), tenant: app.ids.tenant, start, rent: 25000,
    });
    const { body } = await app.call('GET', `/tenant/agreement/${agreement_id}`, { as: 'tenant' });
    assert.equal(body.data.next_due_date, start);
    assert.deepEqual(body.data.next_due_date_bs, body.data.start_date_bs);
    assert.equal(body.data.next_due_rent, 25000);
  });

  test('no Next Due Date once ended, or past the term end', async () => {
    await endActive();
    const pastTerm = (await fixtures.agreement({
      property: await fixtures.property(app.ids.owner), tenant: app.ids.tenant, start: '2020-01-15',
    })).agreement_id;
    for (const id of [ids.endedEarly, pastTerm]) {
      const { status, body } = await app.call('GET', `/tenant/agreement/${id}`, { as: 'tenant' });
      assert.equal(status, 200);
      assert.equal(body.data.next_due_date, null);
      assert.equal(body.data.next_due_date_bs, null);
      assert.equal(body.data.next_due_rent, null);
    }
  });

  test("another Tenant's Agreement, or a malformed id, is 404", async () => {
    for (const id of [ids.others, 'not-a-uuid']) {
      const res = await app.call('GET', `/tenant/agreement/${id}`, { as: 'tenant' });
      assert.equal(res.status, 404);
      assert.equal(res.body.status, 'NAK');
    }
  });

  test("the Statement is the owner's, with the same Fiscal Year defaulting", async () => {
    await fixtures.payment(ids.active, { covers: '2026-01-15', paidOn: '2026-01-20' });
    for (const query of ['', '?fiscal_year=2082']) {
      const mine = await app.call('GET', `/tenant/agreement/${ids.active}/statement${query}`, { as: 'tenant' });
      const owners = await app.call('GET', `/property-owner/agreements/${ids.active}/statement${query}`, { as: 'owner' });
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.body, owners.body);
    }
  });

  test('an ended Agreement is still visible, with its Arrears', async () => {
    const { status, body } = await app.call('GET', `/tenant/agreement/${ids.endedEarly}/statement`, { as: 'tenant' });
    assert.equal(status, 200);
    // Monthly 2024-01-15 to 2025-06-30, nothing paid: 18 periods at 10,000.
    assert.equal(body.data.lifetime_arrears, 180000);
  });

  test("another Tenant's Statement is 404", async () => {
    const res = await app.call('GET', `/tenant/agreement/${ids.others}/statement`, { as: 'tenant' });
    assert.equal(res.status, 404);
  });

  test('a Property Owner token gets 403 on /tenant routes', async () => {
    const res = await app.call('GET', '/tenant/agreements', { as: 'owner' });
    assert.equal(res.status, 403);
    assert.equal(res.body.status, 'NAK');
  });
});
