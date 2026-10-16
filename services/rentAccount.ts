// GLOSSARY.md "Rent Account": an Agreement's rent periods as of a Business
// Date, priced at their Rent In Force and set against the rent paid on them.
// The Payment Statement, Arrears, Portfolio Arrears, the remaining contract
// rent and the Next Due Date all read from one account, so they can't
// disagree. Pure — no database, no clock: the caller passes the Business Date.
// ADR-0005: rent increments are applied, derived on demand, never stored.
// ADR-0007: a rent Payment must land on the Agreement's period grid
// (start_date + N * payment_period).

import { addDays, addPeriods, dateOnly } from '../utils/businessDate';
import { AgreementRow } from '../types';

// The Agreement columns the account reads; every AgreementRow has them.
export type RentAgreement = Pick<
  AgreementRow,
  | 'start_date'
  | 'end_date'
  | 'rent_amount'
  | 'payment_period_id'
  | 'increment_duration_in_years'
  | 'increment_percentage'
  | 'agreement_duration_in_years'
  | 'status'
>;

// Rent paid toward one period: a rent Payment, or a per-period total.
// Entries for the same period add up.
export interface RentPaid {
  period_start: Date | string;
  amount: string | number;
}

export type PeriodStatus = 'paid' | 'partial' | 'unpaid';

export interface DuePeriod {
  period_start: string;
  rent_in_force: number;
  paid: number;
  status: PeriodStatus;
  outstanding: number;
}

export interface NextDue {
  period_start: string;
  rent_in_force: number;
}

export interface LifetimeArrears {
  outstanding: number;
  periods_behind: number;
  months_behind: number;
  oldest_unpaid_period: string | null;
}

export interface RemainingContractRent {
  remaining_contract_rent: number | null;
  remaining_periods: number | null;
}

export interface RentStep {
  index: number;
  start_date: string; // inclusive
  end_date: string; // inclusive
  rent_in_force: number;
  current: boolean;
}

export interface RentAccount {
  // Periods in [from, to] that have fallen due by the Business Date (a period
  // falls due on its first day), never past end_date. Future rent is not a debt.
  duePeriods(from: string, to: string): DuePeriod[];
  // Arrears over the due periods in [from, to]: the Statement's Fiscal Year figure.
  arrears(from: string, to: string): number;
  // Everything owed over the Agreement's whole life. A partially paid period
  // counts as a whole period behind.
  readonly lifetime: LifetimeArrears;
  // Rent still to collect for periods starting after the Business Date, up to
  // the term end, net of rent paid ahead. 0 for an ended Agreement; null for
  // an active one past its nominal term with no end_date (no defined end).
  readonly remaining: RemainingContractRent;
  // GLOSSARY.md "Next Due Date": the first period starting after the Business
  // Date within the term; before start_date, the first period. None once ended.
  readonly nextDue: NextDue | null;
  // The rent of the period containing the Business Date: before start_date
  // the starting rent, after end_date the last period's.
  readonly rentInForceToday: number;
  // rentInForceToday spread over the months its period covers.
  readonly monthlyRent: number;
  // The rent over the whole term, one row per increment step; `current` marks
  // the step containing the Business Date (before the term the first, after
  // it the last).
  readonly schedule: RentStep[];
  // Is this a real period boundary — start_date + N periods — within the term?
  isPeriodStart(date: Date | string): boolean;
  // The last day (inclusive) of the period starting `periodStart`, which must
  // be on the grid, capped at end_date.
  periodEnd(periodStart: Date | string): string;
}

// Coupled to the seed order in data/payment_period.csv (1 Monthly, 2
// Quarterly, 3 Half-yearly, 4 Yearly); ADR-0011 locks these rows.
const PAYMENT_PERIOD_MONTHS: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 12 };

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Whole calendar months between two 'YYYY-MM-DD' dates, ignoring day — safe
// only for grid-aligned dates, which addPeriods produces.
const monthsElapsed = (startDate: string, targetDate: string): number => {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ty, tm] = targetDate.split('-').map(Number);
  return (ty - sy) * 12 + (tm - sm);
};

const settle = (rentInForce: number, paid: number): { status: PeriodStatus; outstanding: number } => ({
  status: paid <= 0 ? 'unpaid' : paid < rentInForce ? 'partial' : 'paid',
  outstanding: round2(Math.max(0, rentInForce - paid)),
});

export const rentAccount = (agreement: RentAgreement, rentPaid: RentPaid[], asOf: string): RentAccount => {
  const start = dateOnly(agreement.start_date);
  const end = agreement.end_date ? dateOnly(agreement.end_date) : null;
  const months = PAYMENT_PERIOD_MONTHS[agreement.payment_period_id];
  if (!months) throw new Error(`Unrecognised payment_period_id: ${agreement.payment_period_id}`);
  const incYears = agreement.increment_duration_in_years != null ? Number(agreement.increment_duration_in_years) : null;
  const pct = agreement.increment_percentage != null ? Number(agreement.increment_percentage) : null;
  const hasIncrement = !!incYears && pct != null;
  const ended = agreement.status === 'ended';

  // end_date, or, without one, the day before start_date + the declared duration.
  const termEnd =
    end ?? addDays(addPeriods(start, 1, Math.round(Number(agreement.agreement_duration_in_years) * 12)), -1);

  const paidByPeriod = new Map<string, number>();
  for (const p of rentPaid) {
    const key = dateOnly(p.period_start);
    paidByPeriod.set(key, round2((paidByPeriod.get(key) ?? 0) + Number(p.amount)));
  }
  const paidOn = (periodStart: string): number => paidByPeriod.get(periodStart) ?? 0;

  // Rent In Force for a grid-aligned date: rent_amount compounded once per
  // completed increment duration, rounded at each step (ADR-0005) — a real
  // renegotiation lands on a round figure and the next increment is taken on it.
  const rentAt = (periodStart: string): number => {
    let rent = round2(Number(agreement.rent_amount));
    if (!hasIncrement) return rent;
    const increments = Math.max(0, Math.floor(monthsElapsed(start, periodStart) / (incYears! * 12)));
    for (let i = 0; i < increments; i++) rent = round2(rent * (1 + pct! / 100));
    return rent;
  };

  // Grid periods starting in [from, to], never past end_date. Generated from
  // start_date so boundaries stay aligned whatever the window.
  const periodsBetween = (from: string, to: string): NextDue[] => {
    const last = end && end < to ? end : to;
    const periods: NextDue[] = [];
    for (let i = 0, p = start; p <= last; p = addPeriods(start, ++i, months)) {
      if (p >= from) periods.push({ period_start: p, rent_in_force: rentAt(p) });
    }
    return periods;
  };

  const duePeriods = (from: string, to: string): DuePeriod[] =>
    periodsBetween(from, to < asOf ? to : asOf).map((p) => {
      const paid = paidOn(p.period_start);
      return { ...p, paid, ...settle(p.rent_in_force, paid) };
    });

  const sumOutstanding = (periods: { outstanding: number }[]): number =>
    round2(periods.reduce((sum, p) => sum + p.outstanding, 0));

  const rentInForceOn = (date: string): number => {
    const due = periodsBetween(start, end && end < date ? end : date);
    return due.length ? due[due.length - 1].rent_in_force : rentAt(start);
  };

  return {
    duePeriods,
    arrears: (from, to) => sumOutstanding(duePeriods(from, to)),

    get lifetime() {
      const owed = duePeriods(start, asOf).filter((p) => p.outstanding > 0);
      return {
        outstanding: sumOutstanding(owed),
        periods_behind: owed.length,
        months_behind: owed.length * months,
        oldest_unpaid_period: owed[0]?.period_start ?? null,
      };
    },

    get remaining() {
      if (ended) return { remaining_contract_rent: 0, remaining_periods: 0 };
      if (!end && termEnd < asOf) return { remaining_contract_rent: null, remaining_periods: null };
      const left = periodsBetween(addDays(asOf, 1), termEnd)
        .map((p) => settle(p.rent_in_force, paidOn(p.period_start)))
        .filter((p) => p.outstanding > 0);
      return { remaining_contract_rent: sumOutstanding(left), remaining_periods: left.length };
    },

    get nextDue() {
      if (ended) return null;
      return periodsBetween(addDays(asOf, 1), termEnd)[0] ?? null;
    },

    get rentInForceToday() {
      return rentInForceOn(asOf);
    },

    get monthlyRent() {
      return rentInForceOn(asOf) / months;
    },

    get schedule() {
      const steps: Omit<RentStep, 'current'>[] = [];
      let stepStart = start;
      while (stepStart <= termEnd) {
        const nextStart = hasIncrement ? addPeriods(start, steps.length + 1, incYears! * 12) : null;
        const stepEnd = nextStart && nextStart <= termEnd ? addDays(nextStart, -1) : termEnd;
        steps.push({ index: steps.length + 1, start_date: stepStart, end_date: stepEnd, rent_in_force: rentAt(stepStart) });
        if (!nextStart) break;
        stepStart = nextStart;
      }
      let current = steps.findIndex((s) => s.start_date <= asOf && asOf <= s.end_date);
      if (current === -1 && steps.length) current = asOf < steps[0].start_date ? 0 : steps.length - 1;
      return steps.map((s, i) => ({ ...s, current: i === current }));
    },

    isPeriodStart(date) {
      const d = dateOnly(date);
      if (d < start || (end && d > end)) return false;
      let i = 0;
      let candidate = start;
      while (candidate < d) candidate = addPeriods(start, ++i, months);
      return candidate === d;
    },

    periodEnd(periodStart) {
      const index = Math.floor(monthsElapsed(start, dateOnly(periodStart)) / months);
      const last = addDays(addPeriods(start, index + 1, months), -1);
      return end && end < last ? end : last;
    },
  };
};
