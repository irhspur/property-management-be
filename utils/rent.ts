// Pure calculation — no DB access. ADR-0005: rent increments are applied,
// derived on demand, never stored. ADR-0007: a rent Payment must land on the
// Agreement's period grid (start_date + N * payment_period).

import { addDays } from './businessDate';

export interface AgreementRentTerms {
  start_date: string; // AD 'YYYY-MM-DD'
  end_date?: string | null;
  rent_amount: string | number;
  payment_period_id: number;
  increment_duration_in_years?: string | number | null;
  increment_percentage?: string | number | null;
}

export interface ExpectedPeriod {
  period_start: string;
  rent_in_force: number;
}

// pg has no custom type parser registered (config/database.js), so a DATE
// column comes back as a JS Date built from LOCAL date components (see
// postgres-date), not a string. This module works entirely in AD
// 'YYYY-MM-DD' strings, so every date read from the database must be
// normalised using local getters — the same ones pg used to build the
// Date — never toISOString(), which can roll the calendar day for
// timezones east of UTC.
export const dateOnly = (d: Date | string): string => {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const toRentTerms = (agreement: Record<string, any>): AgreementRentTerms => ({
  start_date: dateOnly(agreement.start_date),
  end_date: agreement.end_date ? dateOnly(agreement.end_date) : null,
  rent_amount: agreement.rent_amount,
  payment_period_id: agreement.payment_period_id,
  increment_duration_in_years: agreement.increment_duration_in_years,
  increment_percentage: agreement.increment_percentage,
});

// Coupled to the seed order in data/payment_period.csv (1 Monthly, 2
// Quarterly, 3 Half-yearly, 4 Yearly) — same posture as ownerTenant.ts
// hardcoding user_type_id 3 for "tenant".
export const PAYMENT_PERIOD_MONTHS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 6,
  4: 12,
};

const monthsPerPeriod = (a: AgreementRentTerms): number => {
  const months = PAYMENT_PERIOD_MONTHS[a.payment_period_id];
  if (!months) throw new Error(`Unrecognised payment_period_id: ${a.payment_period_id}`);
  return months;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Whole calendar months between two AD 'YYYY-MM-DD' dates, ignoring day —
// safe here because every date this is called with is grid-aligned by
// addPeriods, which preserves day-of-month (or clamps consistently).
const monthsElapsed = (startDate: string, targetDate: string): number => {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ty, tm] = targetDate.split('-').map(Number);
  return (ty - sy) * 12 + (tm - sm);
};

// `startDate` advanced by `periodsElapsed * monthsPerPeriodCount` months.
// Manual integer month arithmetic, not JS Date +setMonth, so a start date of
// the 31st doesn't silently overflow into the next month — it clamps to the
// target month's last day instead, same day every cycle where possible.
export const addPeriods = (startDate: string, periodsElapsed: number, monthsPerPeriodCount: number): string => {
  const [y, m, d] = startDate.split('-').map(Number);
  const totalMonths = m - 1 + periodsElapsed * monthsPerPeriodCount;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-indexed
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// CONTEXT.md "Rent In Force": rent_amount compounded once per completed
// increment duration since start_date, rounded at each step (ADR-0005) — a
// real renegotiation lands on a round figure and the next increment is taken
// on that figure, so step-rounding matches what actually happens.
export const rentInForce = (agreement: AgreementRentTerms, periodStart: string): number => {
  let rent = Number(agreement.rent_amount);
  const incYears =
    agreement.increment_duration_in_years != null ? Number(agreement.increment_duration_in_years) : null;
  const pct = agreement.increment_percentage != null ? Number(agreement.increment_percentage) : null;
  if (!incYears || pct == null) return round2(rent);

  const incMonths = incYears * 12;
  const elapsed = monthsElapsed(agreement.start_date, periodStart);
  const increments = Math.max(0, Math.floor(elapsed / incMonths));
  for (let i = 0; i < increments; i++) {
    rent = round2(rent * (1 + pct / 100));
  }
  return rent;
};

// ADR-0007's strict grid: is `periodStart` a real period boundary for this
// Agreement — start_date + N * payment_period for some whole N — and within
// its term? Used to validate a rent Payment's covers_period_start on write.
export const isValidPeriodStart = (agreement: AgreementRentTerms, periodStart: string): boolean => {
  if (periodStart < agreement.start_date) return false;
  if (agreement.end_date && periodStart > agreement.end_date) return false;

  const months = monthsPerPeriod(agreement);
  let idx = 0;
  let candidate = agreement.start_date;
  while (candidate < periodStart) {
    idx += 1;
    candidate = addPeriods(agreement.start_date, idx, months);
  }
  return candidate === periodStart;
};

// The rent periods this Agreement expects between `from` and `to` (inclusive
// AD 'YYYY-MM-DD'), each priced at its Rent In Force. Periods are generated
// from the Agreement's own start_date so boundaries stay grid-aligned
// regardless of the requested window, and never extend past end_date — a
// former tenant's ended Agreement stops accruing periods at move-out (ADR-0007,
// "allow Payments against ended Agreements" from the grill session).
export const expectedPeriods = (agreement: AgreementRentTerms, from: string, to: string): ExpectedPeriod[] => {
  const months = monthsPerPeriod(agreement);
  const cappedTo = agreement.end_date && agreement.end_date < to ? agreement.end_date : to;

  const periods: ExpectedPeriod[] = [];
  let idx = 0;
  let periodStart = agreement.start_date;
  while (periodStart <= cappedTo) {
    if (periodStart >= from) {
      periods.push({ period_start: periodStart, rent_in_force: rentInForce(agreement, periodStart) });
    }
    idx += 1;
    periodStart = addPeriods(agreement.start_date, idx, months);
  }
  return periods;
};

export type PeriodStatus = 'paid' | 'partial' | 'unpaid';

// How one due period stands against what was paid toward it. Shared by the
// Payment Statement (one Fiscal Year) and portfolio Arrears (lifetime) so the
// two can never price the same period differently.
export const settlePeriod = (
  rentInForceAmount: number,
  paidAmount: number
): { status: PeriodStatus; outstanding: number } => ({
  status: paidAmount <= 0 ? 'unpaid' : paidAmount < rentInForceAmount ? 'partial' : 'paid',
  outstanding: round2(Math.max(0, rentInForceAmount - paidAmount)),
});

export interface RentStep {
  index: number;
  start_date: string;
  end_date: string;
  rent_in_force: number;
}

// The Agreement's rent over its whole term, one row per increment step, each
// priced by rentInForce() so it always agrees with the Payment Statement.
// Dates are inclusive. The term ends at end_date, or, without one, the day
// before start_date + agreement_duration_in_years. No increment terms gives a
// single row at rent_amount.
export const rentSchedule = (
  agreement: AgreementRentTerms,
  agreementDurationInYears: string | number
): RentStep[] => {
  const termEnd =
    agreement.end_date ?? addDays(addPeriods(agreement.start_date, 1, Math.round(Number(agreementDurationInYears) * 12)), -1);
  const incYears =
    agreement.increment_duration_in_years != null ? Number(agreement.increment_duration_in_years) : null;
  const hasIncrement = !!incYears && agreement.increment_percentage != null;

  const steps: RentStep[] = [];
  let stepStart = agreement.start_date;
  while (stepStart <= termEnd) {
    const nextStart = hasIncrement
      ? addPeriods(agreement.start_date, steps.length + 1, incYears * 12)
      : null;
    const stepEnd = nextStart && nextStart <= termEnd ? addDays(nextStart, -1) : termEnd;
    steps.push({
      index: steps.length + 1,
      start_date: stepStart,
      end_date: stepEnd,
      rent_in_force: rentInForce(agreement, stepStart),
    });
    if (!nextStart) break;
    stepStart = nextStart;
  }
  return steps;
};

// Rent In Force on `date`: the rent of the period containing it, which is
// what the Payment Statement charges for that period. Before start_date, the
// starting rent; after end_date, the rent of the last period. Takes the day
// into account, unlike rentInForce(), so an increment applies from its exact
// start date.
export const rentInForceOn = (agreement: AgreementRentTerms, date: string): number => {
  const asOf = agreement.end_date && agreement.end_date < date ? agreement.end_date : date;
  const periods = expectedPeriods(agreement, agreement.start_date, asOf);
  return periods.length
    ? periods[periods.length - 1].rent_in_force
    : rentInForce(agreement, agreement.start_date);
};
