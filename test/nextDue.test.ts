// utils/rent.ts nextDue(): GLOSSARY.md "Next Due Date". Pure, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue } from '../utils/rent';

// 2080/01/01 BS, NPR 30,000 a month for 24 months, +10% after year 1.
const terms = (overrides: Record<string, unknown> = {}) => ({
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
const due = (t: Record<string, unknown>, asOf: string, status = 'active') => nextDue({ ...t, status }, asOf);

test('mid-period: the next period, at its Rent In Force', () => {
  assert.deepEqual(due(terms(), '2024-06-20'), { period_start: '2024-07-14', rent_in_force: 33000 });
});

test('on a period start that period is already due, so the one after it', () => {
  assert.deepEqual(due(terms(), '2024-06-14'), { period_start: '2024-07-14', rent_in_force: 33000 });
});

test('the period crossing an increment step is priced at the new rent', () => {
  assert.deepEqual(due(terms(), '2024-03-20'), { period_start: '2024-04-14', rent_in_force: 33000 });
});

test('before start_date: the first period', () => {
  assert.deepEqual(due(terms(), '2023-01-01'), { period_start: '2023-04-14', rent_in_force: 30000 });
});

test('quarterly: the next grid boundary, not next month', () => {
  assert.deepEqual(due(terms({ payment_period_id: 2 }), '2023-05-01'), { period_start: '2023-07-14', rent_in_force: 30000 });
});

test('an ended Agreement has none', () => {
  assert.equal(due(terms(), '2024-06-20', 'ended'), null);
});

test('in the last period of the term: none', () => {
  assert.equal(due(terms(), '2025-03-20'), null);
});

test('past the nominal term with no end_date: none', () => {
  assert.equal(due(terms(), '2026-01-01'), null);
});

test('the next boundary falls after end_date: none', () => {
  assert.equal(due(terms({ end_date: '2024-09-30' }), '2024-09-20'), null);
});
