// Payment Ledger (ledger improvements spec, items 1-3).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as paymentService from '../services/paymentService';
import { today, monthOf } from '../utils/businessDate';
import { periodEnd, dateOnly } from '../utils/rent';
import { toBs, toBsMany } from '../utils/nepaliCalendar';

const db = useTestDatabase();

const RENT = 1;
let ownerId: string;
let tenantId: string;
let monthlyId: string;
let quarterlyId: string;

const t = today();
const threeMonthsAgo = monthOf(t, -3).from;
const eightMonthsAgo = monthOf(t, -8).from;

before(async () => {
  const { deposit } = await db.one(`SELECT MIN(id) AS deposit FROM payment_purpose WHERE id <> ${RENT}`);
  ownerId = await fixtures.owner();
  tenantId = await fixtures.tenant({ linkedTo: ownerId });
  const property = await fixtures.property(ownerId, { name: 'Ledger House' });

  monthlyId = (await fixtures.agreement({ property, tenant: tenantId, start: '2025-01-31' })).agreement_id;
  // Ended, so it can share the property with the active one.
  quarterlyId = (await fixtures.agreement({
    property, tenant: tenantId, start: '2025-01-15', end: '2025-05-01', periodId: 2, status: 'ended',
  })).agreement_id;

  await fixtures.payment(monthlyId, { amount: 1000, paidOn: t, covers: '2025-02-28' });
  await fixtures.payment(monthlyId, { amount: 300, paidOn: threeMonthsAgo, covers: '2025-01-31' });
  await fixtures.payment(monthlyId, { purpose: deposit, amount: 50000, paidOn: t, covers: null });
  await fixtures.payment(quarterlyId, { amount: 7000, paidOn: eightMonthsAgo, covers: '2025-04-15' });
});

test('periodEnd steps from start_date and caps at end_date', () => {
  const monthly = { start_date: '2025-01-31', end_date: null, payment_period_id: 1 };
  assert.equal(periodEnd(monthly, '2025-01-31'), '2025-02-27');
  // Feb's period is clamped to the 28th; the next still starts on Mar 31.
  assert.equal(periodEnd(monthly, '2025-02-28'), '2025-03-30');
  const quarterly = { start_date: '2025-01-15', end_date: '2025-05-01', payment_period_id: 2 };
  assert.equal(periodEnd(quarterly, '2025-01-15'), '2025-04-14');
  assert.equal(periodEnd(quarterly, '2025-04-15'), '2025-05-01');
});

test('toBsMany matches toBs, and is null past the seeded calendar', async () => {
  const bs = await toBsMany(['2025-01-15', t, '2025-01-15', '2099-01-01']);
  assert.equal(bs.size, 3);
  assert.deepEqual(bs.get('2025-01-15'), await toBs('2025-01-15'));
  assert.deepEqual(bs.get(t), await toBs(t));
  assert.equal(bs.get('2099-01-01'), null);
});

test('ledger rows carry period end and BS dates, paged and all=true', async () => {
  const paged = await paymentService.getLedger(ownerId, {});
  const all = await paymentService.getLedger(ownerId, { all: true });
  assert.equal(paged.total, 4);
  assert.deepEqual(paged.data, all.data);

  const byCovers = new Map(paged.data.map((r) => [r.covers_period_start && r.covers_period_end, r]));
  assert.ok(byCovers.has('2025-03-30'));
  assert.ok(byCovers.has('2025-02-27'));
  assert.ok(byCovers.has('2025-05-01'));

  for (const row of paged.data) {
    assert.ok(!('agreement_start_date' in row) && !('agreement_payment_period_id' in row));
    assert.deepEqual(row.paid_on_bs, await toBs(dateOnly(row.paid_on)));
    if (row.covers_period_start) {
      assert.deepEqual(row.covers_period_start_bs, await toBs(dateOnly(row.covers_period_start)));
      assert.deepEqual(row.covers_period_end_bs, await toBs(row.covers_period_end));
    } else {
      assert.equal(row.covers_period_end, null);
      assert.equal(row.covers_period_start_bs, null);
      assert.equal(row.covers_period_end_bs, null);
    }
  }
});

test('single-agreement list and single payment carry the same fields', async () => {
  const list = await paymentService.getPaymentsForAgreement(ownerId, tenantId, monthlyId);
  assert.equal(list.length, 3);
  const rent = list.find((p) => p.covers_period_end === '2025-03-30');
  assert.ok(rent);
  const single = await paymentService.getPayment(ownerId, tenantId, monthlyId, rent.payment_id);
  assert.deepEqual(single, rent);
  assert.ok(single.paid_on_bs);
});

test('summary: from only returns both keys, to is today', async () => {
  const s = await paymentService.getLedgerSummary(ownerId, { from: threeMonthsAgo });
  assert.equal(s.from, threeMonthsAgo);
  assert.equal(s.to, t);
  assert.ok(s.to >= s.from);
  assert.equal(s.total_rent_collected, 1300);
});

test('summary: to only is the earliest rent payment, or to itself with none', async () => {
  const s = await paymentService.getLedgerSummary(ownerId, { to: t });
  assert.equal(s.from, eightMonthsAgo);
  assert.equal(s.to, t);

  const empty = await paymentService.getLedgerSummary(ownerId, { to: '2020-01-01' });
  assert.equal(empty.from, '2020-01-01');
  assert.equal(empty.to, '2020-01-01');
});

test('summary: neither or both are unchanged, and no trend unless asked', async () => {
  const both = await paymentService.getLedgerSummary(ownerId, { from: '2025-01-01', to: '2025-12-31' });
  assert.equal(both.from, '2025-01-01');
  assert.equal(both.to, '2025-12-31');
  assert.ok(!('trend' in both));

  const neither = await paymentService.getLedgerSummary(ownerId, {});
  assert.ok(neither.from <= t && neither.to >= t);
});

test('trend: trend_months months ending this month, ignoring from', async () => {
  const s = await paymentService.getLedgerSummary(ownerId, { from: t, trendMonths: '5' });
  assert.deepEqual(
    s.trend!.map((m) => m.month),
    [-4, -3, -2, -1, 0].map((o) => monthOf(t, o).from.slice(0, 7))
  );
  assert.deepEqual(s.trend!.map((m) => m.total), [0, 300, 0, 0, 1000]);
  // monthly still follows from.
  assert.deepEqual(s.monthly, [{ month: t.slice(0, 7), total: 1000 }]);

  const ended = await paymentService.getLedgerSummary(ownerId, { to: eightMonthsAgo, trendMonths: '2' });
  assert.deepEqual(ended.trend!.map((m) => m.total), [0, 7000]);
});

test('trend: tenant filter applies', async () => {
  const other = await paymentService.getLedgerSummary(ownerId, {
    tenantId: '00000000-0000-0000-0000-000000000000',
    trendMonths: '3',
  });
  assert.deepEqual(other.trend!.map((m) => m.total), [0, 0, 0]);
});

test('trend: invalid trend_months is a 400', async () => {
  for (const bad of ['0', '25', '2.5', 'abc', '-1', '']) {
    await assert.rejects(paymentService.getLedgerSummary(ownerId, { trendMonths: bad }), { statusCode: 400 }, bad);
  }
});
