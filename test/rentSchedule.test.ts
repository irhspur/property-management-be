// utils/rent.ts rentSchedule(): pure, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentSchedule, AgreementRentTerms } from '../utils/rent';

const terms = (overrides: Partial<AgreementRentTerms> = {}): AgreementRentTerms => ({
  start_date: '2024-01-15',
  end_date: null,
  rent_amount: '45000.00',
  payment_period_id: 1,
  increment_duration_in_years: 1,
  increment_percentage: '10.00',
  ...overrides,
});

test('one row per increment step, compounded, ending at start + duration when there is no end_date', () => {
  assert.deepEqual(rentSchedule(terms(), 3), [
    { index: 1, start_date: '2024-01-15', end_date: '2025-01-14', rent_in_force: 45000 },
    { index: 2, start_date: '2025-01-15', end_date: '2026-01-14', rent_in_force: 49500 },
    { index: 3, start_date: '2026-01-15', end_date: '2027-01-14', rent_in_force: 54450 },
  ]);
});

test('end_date wins over the declared duration and cuts the last step short', () => {
  const steps = rentSchedule(terms({ end_date: '2025-06-30' }), 5);
  assert.deepEqual(steps.map((s) => [s.start_date, s.end_date]), [
    ['2024-01-15', '2025-01-14'],
    ['2025-01-15', '2025-06-30'],
  ]);
});

test('an end_date on the day before a step does not start that step', () => {
  const steps = rentSchedule(terms({ end_date: '2026-01-14' }), 5);
  assert.equal(steps.length, 2);
  assert.equal(steps[1].end_date, '2026-01-14');
});

test('no increment clause gives a single row at rent_amount', () => {
  const steps = rentSchedule(terms({ increment_duration_in_years: null, increment_percentage: null }), '2.00');
  assert.deepEqual(steps, [
    { index: 1, start_date: '2024-01-15', end_date: '2026-01-14', rent_in_force: 45000 },
  ]);
});

test('multi-year increments and a month-end start date', () => {
  const steps = rentSchedule(
    terms({ start_date: '2024-02-29', increment_duration_in_years: 2, increment_percentage: 5 }),
    5
  );
  assert.deepEqual(steps.map((s) => [s.start_date, s.end_date, s.rent_in_force]), [
    ['2024-02-29', '2026-02-27', 45000],
    ['2026-02-28', '2028-02-28', 47250],
    ['2028-02-29', '2029-02-27', 49612.5],
  ]);
});
