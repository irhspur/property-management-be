// Payment Statement improvements (statement spec, items 1-4).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as paymentService from '../services/paymentService';
import * as agreementService from '../services/agreementService';
import { today, addDays, monthOf } from '../utils/businessDate';
import { currentFiscalYear, toBs, toAd, fiscalYearRange } from '../utils/nepaliCalendar';

useTestDatabase();

const BASE_URL = 'http://test';
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let endedTenantId: string;
let activeId: string;
let endedId: string;

const t = today();
const lastMonth = monthOf(t, -1).from;

before(async () => {
  ownerId = await fixtures.owner();
  otherOwnerId = await fixtures.owner();
  tenantId = await fixtures.tenant({ linkedTo: ownerId });
  endedTenantId = await fixtures.tenant({ linkedTo: ownerId });

  // Monthly from the 1st, 14 months back: spans this and the previous FY.
  activeId = (await fixtures.agreement({
    property: await fixtures.property(ownerId), tenant: tenantId, start: monthOf(t, -14).from,
  })).agreement_id;
  endedId = (await fixtures.agreement({
    property: await fixtures.property(ownerId), tenant: endedTenantId,
    start: '2025-01-15', end: '2025-06-30', status: 'ended',
  })).agreement_id;

  // Last month's period settled in two parts; the later one is listed first.
  await fixtures.payment(activeId, { paidOn: addDays(lastMonth, 2), covers: lastMonth, amount: 4000, method: 1, remarks: 'first half' });
  await fixtures.payment(activeId, { paidOn: addDays(lastMonth, 9), covers: lastMonth, amount: 6000, method: 2 });
  await fixtures.payment(activeId, { paidOn: t, covers: monthOf(t).from, amount: 10000, method: 1, remarks: 'on time' });
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

test('remaining_contract_rent is the same whatever the fiscal year', async () => {
  const fy = await currentFiscalYear();
  const current = await paymentService.getStatement(ownerId, tenantId, activeId, fy);
  const previous = await paymentService.getStatement(ownerId, tenantId, activeId, fy - 1);
  // 3-year term from 14 months back, no increments: months 16–36 remain.
  assert.equal(current.remaining_periods, 21);
  assert.equal(current.remaining_contract_rent, 21 * 10000);
  assert.equal(previous.remaining_contract_rent, current.remaining_contract_rent);
  assert.equal(previous.remaining_periods, current.remaining_periods);

  const ended = await paymentService.getStatement(ownerId, endedTenantId, endedId, 2081);
  assert.equal(ended.remaining_contract_rent, 0);
  assert.equal(ended.remaining_periods, 0);
});

const fiscalYears = async (start: string, end: string | null = null, status: 'active' | 'ended' = 'active') => {
  const tenant = await fixtures.tenant({ linkedTo: ownerId });
  const { agreement_id } = await fixtures.agreement({
    property: await fixtures.property(ownerId), tenant, start, end, status,
  });
  return { agreement_id, s: await paymentService.getStatementByAgreementId(ownerId, agreement_id) };
};

test('fiscal_years: same whatever the fiscal year, descending, consecutive, reaching the current FY', async () => {
  const fy = await currentFiscalYear();
  const current = await paymentService.getStatement(ownerId, tenantId, activeId, fy);
  const previous = await paymentService.getStatement(ownerId, tenantId, activeId, fy - 1);
  assert.deepEqual(previous.fiscal_years, current.fiscal_years);
  assert.equal(current.fiscal_years[0], fy);
  assert.ok(current.fiscal_years.length >= 2);
  current.fiscal_years.forEach((y: number, i: number) => i && assert.equal(y, current.fiscal_years[i - 1] - 1));
});

test('fiscal_years: every due period falls in a listed year, and no period outside them', async () => {
  const s = await paymentService.getStatementByAgreementId(ownerId, activeId);
  const listed = new Set<number>(s.fiscal_years);
  let total = 0;
  for (const y of [...listed, Math.min(...listed) - 1, Math.max(...listed) + 1]) {
    const { periods } = await paymentService.getStatementByAgreementId(ownerId, activeId, y);
    if (!listed.has(y)) assert.equal(periods.length, 0);
    total += periods.length;
  }
  assert.equal(total, 15);
});

test('fiscal_years: an ended agreement stops at the year it ended, and the statement opens there', async () => {
  // The spec example: 15 Magh 2079 – end of Poush 2081 (29 days, not the spec's 30).
  const { agreement_id, s } = await fiscalYears(await toAd(2079, 10, 15), await toAd(2081, 9, 29), 'ended');
  assert.deepEqual(s.fiscal_years, [2081, 2080, 2079]);
  assert.equal(s.fiscal_year, 2081);
  assert.deepEqual(s.fiscal_year_range, await fiscalYearRange(2081));
  assert.ok(s.periods.length > 0);
  // An explicit year outside the list is still accepted, just empty.
  const later = await paymentService.getStatementByAgreementId(ownerId, agreement_id, 2082);
  assert.equal(later.periods.length, 0);
  assert.deepEqual(later.fiscal_years, s.fiscal_years);
});

test('fiscal_years: an active agreement whose end_date has passed stops there too', async () => {
  const { s } = await fiscalYears(await toAd(2079, 10, 15), await toAd(2081, 9, 29));
  assert.deepEqual(s.fiscal_years, [2081, 2080, 2079]);
});

test('fiscal_years: Ashad starts in the previous opening year, Shrawan in its own', async () => {
  assert.deepEqual((await fiscalYears(await toAd(2080, 3, 1), await toAd(2080, 5, 1))).s.fiscal_years, [2080, 2079]);
  assert.deepEqual((await fiscalYears(await toAd(2080, 4, 1), await toAd(2080, 5, 1))).s.fiscal_years, [2080]);
});

test('fiscal_years: a future-dated agreement lists only its first year and opens on it', async () => {
  const fy = await currentFiscalYear();
  const { s } = await fiscalYears(await toAd(fy + 2, 4, 1));
  assert.deepEqual(s.fiscal_years, [fy + 2]);
  assert.equal(s.fiscal_year, fy + 2);
  assert.equal(s.periods.length, 0);
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
