// Payment Statement improvements (statement spec, items 1-4).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as paymentService from '../services/paymentService';
import * as agreementService from '../services/agreementService';
import { today, addDays, monthOf } from '../utils/businessDate';
import { currentFiscalYear, toBs } from '../utils/nepaliCalendar';

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
