// utils/rent.ts remainingContractRent(): pure, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingContractRent, lifetimeOutstanding, expectedPeriods, termEndOf, AgreementRentTerms } from '../utils/rent';

// 2080/01/01 BS, NPR 30,000 a month for 24 months, +10% after year 1.
const terms = (overrides: Partial<AgreementRentTerms> = {}): AgreementRentTerms => ({
  start_date: '2023-04-14',
  end_date: null,
  rent_amount: '30000.00',
  payment_period_id: 1,
  increment_duration_in_years: 1,
  increment_percentage: '10.00',
  ...overrides,
});
const MONTH_15 = '2024-06-20'; // inside the period starting 2024-06-14
const none = new Map<string, number>();
const remaining = (t: AgreementRentTerms, asOf: string, paid = none, status = 'active', years: number | string = 2) =>
  remainingContractRent(t, years, status, paid, asOf);

test('the spec example: months 16–24 at the escalated rent', () => {
  assert.deepEqual(remaining(terms(), MONTH_15), { remaining_contract_rent: 297000, remaining_periods: 9 });
});

test('a term crossing an increment step prices each side at its own rent', () => {
  // Month 6: months 7–12 at 30,000, 13–24 at 33,000.
  assert.deepEqual(remaining(terms(), '2023-09-20'), {
    remaining_contract_rent: 6 * 30000 + 12 * 33000,
    remaining_periods: 18,
  });
});

test('before start_date: the whole term', () => {
  assert.deepEqual(remaining(terms(), '2023-01-01'), {
    remaining_contract_rent: 12 * 30000 + 12 * 33000,
    remaining_periods: 24,
  });
});

test('rent paid ahead reduces the figure; a fully paid period stops counting', () => {
  const paid = new Map([['2024-07-14', 33000], ['2024-08-14', 10000]]);
  assert.deepEqual(remaining(terms(), MONTH_15, paid), { remaining_contract_rent: 297000 - 43000, remaining_periods: 8 });
});

test('every remaining period paid ahead: 0', () => {
  const t = terms();
  const paid = new Map(expectedPeriods(t, '2024-06-21', termEndOf(t, 2)).map((p) => [p.period_start, p.rent_in_force]));
  assert.deepEqual(remaining(t, MONTH_15, paid), { remaining_contract_rent: 0, remaining_periods: 0 });
});

test('a period starting today is due, not remaining', () => {
  assert.equal(remaining(terms(), '2024-06-14').remaining_periods, 9);
  assert.equal(remaining(terms(), '2024-06-13').remaining_periods, 10);
});

test('end_date in the past or today on an active agreement: 0', () => {
  assert.deepEqual(remaining(terms({ end_date: '2024-06-20' }), MONTH_15), { remaining_contract_rent: 0, remaining_periods: 0 });
  assert.deepEqual(remaining(terms({ end_date: '2024-01-01' }), MONTH_15), { remaining_contract_rent: 0, remaining_periods: 0 });
});

test('end_date wins over the nominal duration', () => {
  // Periods starting 2024-07-14 .. 2024-09-14.
  assert.deepEqual(remaining(terms({ end_date: '2024-09-30' }), MONTH_15, none, 'active', 5), {
    remaining_contract_rent: 3 * 33000,
    remaining_periods: 3,
  });
});

test('ended agreement: 0', () => {
  assert.deepEqual(remaining(terms({ end_date: '2025-04-13' }), MONTH_15, none, 'ended'), {
    remaining_contract_rent: 0,
    remaining_periods: 0,
  });
});

test('no end_date and past the nominal term: null', () => {
  assert.deepEqual(remaining(terms(), '2025-04-14'), { remaining_contract_rent: null, remaining_periods: null });
  // On the last day of the nominal term it is still defined: nothing left.
  assert.deepEqual(remaining(terms(), '2025-04-13'), { remaining_contract_rent: 0, remaining_periods: 0 });
});

test('arrears + remaining + rent paid on due periods = the whole term', () => {
  const t = terms();
  const paid = new Map([['2023-04-14', 30000], ['2024-05-14', 20000]]);
  const whole = expectedPeriods(t, t.start_date, termEndOf(t, 2)).reduce((sum, p) => sum + p.rent_in_force, 0);
  const arrears = lifetimeOutstanding(t, paid, MONTH_15).outstanding;
  const { remaining_contract_rent } = remaining(t, MONTH_15, paid);
  assert.equal(arrears + remaining_contract_rent! + 50000, whole);
});

test('no period counts in both arrears and remaining', () => {
  const t = terms();
  const due = expectedPeriods(t, t.start_date, MONTH_15).length;
  assert.equal(lifetimeOutstanding(t, none, MONTH_15).periods_behind + remaining(t, MONTH_15).remaining_periods!, 24);
  assert.equal(due, 15);
});
