// services/rentAccount.ts: GLOSSARY.md "Rent Account". Pure, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentAccount, RentAgreement, RentPaid } from '../services/rentAccount';

// 2080/01/01 BS, NPR 30,000 a month for 24 months, +10% after year 1.
const agreement = (overrides: Partial<RentAgreement> = {}): RentAgreement => ({
  start_date: '2023-04-14',
  end_date: null,
  rent_amount: '30000.00',
  payment_period_id: 1,
  increment_duration_in_years: 1,
  increment_percentage: '10.00',
  agreement_duration_in_years: 2,
  status: 'active',
  ...overrides,
});
const MONTH_15 = '2024-06-20'; // inside the period starting 2024-06-14
const account = (asOf: string, overrides: Partial<RentAgreement> = {}, paid: RentPaid[] = []) =>
  rentAccount(agreement(overrides), paid, asOf);

// --- Next Due Date ---

test('nextDue mid-period: the next period, at its Rent In Force', () => {
  assert.deepEqual(account(MONTH_15).nextDue, { period_start: '2024-07-14', rent_in_force: 33000 });
});

test('nextDue on a period start: that period is already due, so the one after it', () => {
  assert.deepEqual(account('2024-06-14').nextDue, { period_start: '2024-07-14', rent_in_force: 33000 });
});

test('nextDue crossing an increment step is priced at the new rent', () => {
  assert.deepEqual(account('2024-03-20').nextDue, { period_start: '2024-04-14', rent_in_force: 33000 });
});

test('nextDue before start_date: the first period', () => {
  assert.deepEqual(account('2023-01-01').nextDue, { period_start: '2023-04-14', rent_in_force: 30000 });
});

test('nextDue quarterly: the next grid boundary, not next month', () => {
  assert.deepEqual(account('2023-05-01', { payment_period_id: 2 }).nextDue, { period_start: '2023-07-14', rent_in_force: 30000 });
});

test('nextDue: none when ended, in the last period, past the term, or past end_date', () => {
  assert.equal(account(MONTH_15, { status: 'ended' }).nextDue, null);
  assert.equal(account('2025-03-20').nextDue, null);
  assert.equal(account('2026-01-01').nextDue, null);
  assert.equal(account('2024-09-20', { end_date: '2024-09-30' }).nextDue, null);
});

test('rows straight from pg: Date dates and string numbers', () => {
  const a = rentAccount(agreement({ start_date: new Date(2023, 3, 14), agreement_duration_in_years: '2.00' }), [], MONTH_15);
  assert.deepEqual(a.nextDue, { period_start: '2024-07-14', rent_in_force: 33000 });
});

// --- remaining contract rent ---

test('remaining: months 16–24 at the escalated rent', () => {
  assert.deepEqual(account(MONTH_15).remaining, { remaining_contract_rent: 297000, remaining_periods: 9 });
});

test('remaining across an increment step prices each side at its own rent', () => {
  assert.deepEqual(account('2023-09-20').remaining, { remaining_contract_rent: 6 * 30000 + 12 * 33000, remaining_periods: 18 });
});

test('remaining before start_date: the whole term', () => {
  assert.deepEqual(account('2023-01-01').remaining, { remaining_contract_rent: 12 * 30000 + 12 * 33000, remaining_periods: 24 });
});

test('remaining: rent paid ahead reduces it; a fully paid period stops counting', () => {
  const paid = [
    { period_start: '2024-07-14', amount: 33000 },
    { period_start: '2024-08-14', amount: '6000.00' },
    { period_start: '2024-08-14', amount: 4000 },
  ];
  assert.deepEqual(account(MONTH_15, {}, paid).remaining, { remaining_contract_rent: 297000 - 43000, remaining_periods: 8 });
});

test('remaining: a period starting today is due, not remaining', () => {
  assert.equal(account('2024-06-14').remaining.remaining_periods, 9);
  assert.equal(account('2024-06-13').remaining.remaining_periods, 10);
});

test('remaining: 0 when end_date has passed, ended; end_date wins over duration', () => {
  assert.deepEqual(account(MONTH_15, { end_date: '2024-06-20' }).remaining, { remaining_contract_rent: 0, remaining_periods: 0 });
  assert.deepEqual(account(MONTH_15, { end_date: '2025-04-13', status: 'ended' }).remaining, { remaining_contract_rent: 0, remaining_periods: 0 });
  assert.deepEqual(account(MONTH_15, { end_date: '2024-09-30', agreement_duration_in_years: 5 }).remaining, {
    remaining_contract_rent: 3 * 33000,
    remaining_periods: 3,
  });
});

test('remaining: null past the nominal term with no end_date, 0 on its last day', () => {
  assert.deepEqual(account('2025-04-14').remaining, { remaining_contract_rent: null, remaining_periods: null });
  assert.deepEqual(account('2025-04-13').remaining, { remaining_contract_rent: 0, remaining_periods: 0 });
});

// --- due periods, Arrears ---

test('duePeriods stop at the Business Date and carry paid, status and outstanding', () => {
  const paid = [
    { period_start: '2024-04-14', amount: 33000 },
    { period_start: '2024-05-14', amount: 20000 },
  ];
  assert.deepEqual(account(MONTH_15, {}, paid).duePeriods('2024-04-01', '2024-12-31'), [
    { period_start: '2024-04-14', rent_in_force: 33000, paid: 33000, status: 'paid', outstanding: 0 },
    { period_start: '2024-05-14', rent_in_force: 33000, paid: 20000, status: 'partial', outstanding: 13000 },
    { period_start: '2024-06-14', rent_in_force: 33000, paid: 0, status: 'unpaid', outstanding: 33000 },
  ]);
  assert.equal(account(MONTH_15, {}, paid).arrears('2024-04-01', '2024-12-31'), 46000);
});

test('duePeriods stop at end_date; a window after the Business Date is empty', () => {
  assert.equal(account(MONTH_15, { end_date: '2023-06-01' }).duePeriods('2023-01-01', '2024-12-31').length, 2);
  assert.deepEqual(account(MONTH_15).duePeriods('2024-07-01', '2024-12-31'), []);
});

test('lifetime: whole-life Arrears; a partial period counts as a whole period behind', () => {
  const paid = [
    { period_start: '2023-04-14', amount: 30000 },
    { period_start: '2024-05-14', amount: 20000 },
  ];
  assert.deepEqual(account(MONTH_15, { payment_period_id: 1 }, paid).lifetime, {
    outstanding: 11 * 30000 + 2 * 33000 + 13000,
    periods_behind: 14,
    months_behind: 14,
    oldest_unpaid_period: '2023-05-14',
  });
  assert.equal(account(MONTH_15, { payment_period_id: 2 }).lifetime.months_behind, 5 * 3);
});

test('lifetime with nothing owed', () => {
  assert.deepEqual(account('2023-01-01').lifetime, { outstanding: 0, periods_behind: 0, months_behind: 0, oldest_unpaid_period: null });
});

test('Arrears + remaining + rent paid on due periods = the whole term; no period in both', () => {
  const paid = [
    { period_start: '2023-04-14', amount: 30000 },
    { period_start: '2024-05-14', amount: 20000 },
  ];
  const a = account(MONTH_15, {}, paid);
  assert.equal(a.lifetime.outstanding + a.remaining.remaining_contract_rent! + 50000, 12 * 30000 + 12 * 33000);
  assert.equal(account(MONTH_15).lifetime.periods_behind + account(MONTH_15).remaining.remaining_periods!, 24);
});

// --- Rent In Force today ---

test('rentInForceToday follows the period containing the Business Date, by day', () => {
  const t = { start_date: '2024-01-15', rent_amount: '45000.00', end_date: '2026-06-30' };
  assert.equal(account('2023-12-01', t).rentInForceToday, 45000); // before start
  assert.equal(account('2025-01-14', t).rentInForceToday, 45000); // last day of step 1
  assert.equal(account('2025-01-15', t).rentInForceToday, 49500); // first day of step 2
  assert.equal(account('2026-02-01', t).rentInForceToday, 54450);
  assert.equal(account('2030-01-01', t).rentInForceToday, 54450); // after end_date: last step
  assert.equal(account('2025-03-01', { ...t, end_date: null, payment_period_id: 4 }).rentInForceToday, 49500);
});

test('rentInForceToday does not apply an increment early in its anniversary month', () => {
  // Portfolio Arrears used to apply it from the 1st of the month.
  assert.equal(account('2024-04-02').rentInForceToday, 30000);
  assert.equal(account('2024-04-14').rentInForceToday, 33000);
});

test('monthlyRent spreads a period’s Rent In Force over its months', () => {
  assert.equal(account(MONTH_15).monthlyRent, 33000);
  assert.equal(account('2023-05-01', { payment_period_id: 2, rent_amount: 90000 }).monthlyRent, 30000);
});

// --- increment schedule ---

const scheduleTerms = { start_date: '2024-01-15', rent_amount: '45000.00' };

test('schedule: one row per increment step, ending at start + duration, current by the Business Date', () => {
  assert.deepEqual(account('2025-06-01', { ...scheduleTerms, agreement_duration_in_years: 3 }).schedule, [
    { index: 1, start_date: '2024-01-15', end_date: '2025-01-14', rent_in_force: 45000, current: false },
    { index: 2, start_date: '2025-01-15', end_date: '2026-01-14', rent_in_force: 49500, current: true },
    { index: 3, start_date: '2026-01-15', end_date: '2027-01-14', rent_in_force: 54450, current: false },
  ]);
});

test('schedule: before the term the first step is current, after it the last', () => {
  const before = account('2023-01-01', { ...scheduleTerms, agreement_duration_in_years: 3 }).schedule;
  const after = account('2030-01-01', { ...scheduleTerms, agreement_duration_in_years: 3 }).schedule;
  assert.deepEqual(before.map((s) => s.current), [true, false, false]);
  assert.deepEqual(after.map((s) => s.current), [false, false, true]);
});

test('schedule: end_date wins over the duration and cuts the last step short', () => {
  const steps = account(MONTH_15, { ...scheduleTerms, end_date: '2025-06-30', agreement_duration_in_years: 5 }).schedule;
  assert.deepEqual(steps.map((s) => [s.start_date, s.end_date]), [
    ['2024-01-15', '2025-01-14'],
    ['2025-01-15', '2025-06-30'],
  ]);
  const cut = account(MONTH_15, { ...scheduleTerms, end_date: '2026-01-14', agreement_duration_in_years: 5 }).schedule;
  assert.equal(cut.length, 2);
  assert.equal(cut[1].end_date, '2026-01-14');
});

test('schedule: no increment clause gives a single row at rent_amount', () => {
  const steps = account(MONTH_15, {
    ...scheduleTerms,
    increment_duration_in_years: null,
    increment_percentage: null,
    agreement_duration_in_years: '2.00',
  }).schedule;
  assert.deepEqual(steps, [{ index: 1, start_date: '2024-01-15', end_date: '2026-01-14', rent_in_force: 45000, current: true }]);
});

test('schedule: multi-year increments and a month-end start date', () => {
  const steps = account(MONTH_15, {
    ...scheduleTerms,
    start_date: '2024-02-29',
    increment_duration_in_years: 2,
    increment_percentage: 5,
    agreement_duration_in_years: 5,
  }).schedule;
  assert.deepEqual(steps.map((s) => [s.start_date, s.end_date, s.rent_in_force]), [
    ['2024-02-29', '2026-02-27', 45000],
    ['2026-02-28', '2028-02-28', 47250],
    ['2028-02-29', '2029-02-27', 49612.5],
  ]);
});

// --- the period grid (ADR-0007) ---

test('isPeriodStart: start_date + N periods, within the term', () => {
  const a = account(MONTH_15, { start_date: '2025-01-31', end_date: '2025-06-30' });
  assert.equal(a.isPeriodStart('2025-01-31'), true);
  assert.equal(a.isPeriodStart('2025-02-28'), true); // clamped
  assert.equal(a.isPeriodStart('2025-03-31'), true); // not Mar 28
  assert.equal(a.isPeriodStart('2025-03-28'), false);
  assert.equal(a.isPeriodStart('2024-12-31'), false); // before the term
  assert.equal(a.isPeriodStart('2025-07-31'), false); // after end_date
  assert.equal(a.isPeriodStart(new Date(2025, 4, 31)), true);
});

test('periodEnd steps from start_date and caps at end_date', () => {
  const monthly = account(MONTH_15, { start_date: '2025-01-31' });
  assert.equal(monthly.periodEnd('2025-01-31'), '2025-02-27');
  // Feb's period is clamped to the 28th; the next still starts on Mar 31.
  assert.equal(monthly.periodEnd('2025-02-28'), '2025-03-30');
  const quarterly = account(MONTH_15, { start_date: '2025-01-15', end_date: '2025-05-01', payment_period_id: 2 });
  assert.equal(quarterly.periodEnd('2025-01-15'), '2025-04-14');
  assert.equal(quarterly.periodEnd('2025-04-15'), '2025-05-01');
});
