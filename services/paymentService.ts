import * as paymentModel from '../models/payment';
import * as agreementModel from '../models/agreement';
import * as ownerTenantModel from '../models/ownerTenant';
import * as activityModel from '../models/activityEvent';
import { ActivityEventType } from '../models/activityEvent';
import { withTransaction } from '../utils/transaction';
import { pickFields, PaymentSchema } from '../schemas/index';
import {
  isValidPeriodStart,
  expectedPeriods,
  settlePeriod,
  rentInForce,
  PAYMENT_PERIOD_MONTHS,
  dateOnly,
  toRentTerms,
  periodEnd,
  AgreementRentTerms,
} from '../utils/rent';
import { today, monthKeysBetween, monthOf } from '../utils/businessDate';
import { assertDate, assertUuid } from '../utils/validators';
import { currentFiscalYearRange, currentFiscalYear, fiscalYearRange, toBs, toBsMany } from '../utils/nepaliCalendar';
import { Payment, DbClient } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

// Coupled to the seed order in data/payment_purpose.csv (id 1 = rent) — same
// posture as PAYMENT_PERIOD_MONTHS in utils/rent.ts.
const RENT_PURPOSE_ID = 1;

const assertLinked = async (ownerId: string, tenantId: string): Promise<void> => {
  const linked = await ownerTenantModel.findLink(ownerId, tenantId);
  if (!linked) throw err('You are not allowed to perform this action on this tenant', 403);
};

// Deliberately no agreement.status check — a Payment may be recorded against
// an ended Agreement (grill session 2026-08-22): arrears from before move-out
// remain collectible, and covers_period_start's grid check already confines
// it to periods within the Agreement's actual term.
const getOwnedAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>> => {
  await assertLinked(ownerId, tenantId);
  const agreement = await agreementModel.findById(agreementId);
  if (!agreement) throw err('Agreement not found', 404);
  if (agreement.property_owner_id !== ownerId || agreement.tenant_id !== tenantId) {
    throw err('You are not allowed to perform this action on this agreement', 403);
  }
  return agreement;
};

const recordPaymentEvent = (
  ownerId: string,
  type: ActivityEventType,
  agreement: Record<string, any>,
  payment: { payment_id: string; amount: string | number },
  client: DbClient
): Promise<void> =>
  activityModel.record(
    {
      ownerId,
      type,
      subjectKind: 'payment',
      subjectId: payment.payment_id,
      context: {
        property_name: agreement.property_name,
        tenant_name: activityModel.displayName(agreement.tenant_first_name, agreement.tenant_last_name),
        amount: Number(payment.amount),
      },
    },
    client
  );

// ADR-0007: covers_period_start is required for rent and forbidden otherwise,
// and for rent it must land on the Agreement's period grid.
const validateCoversPeriod = (agreement: Record<string, any>, f: Record<string, any>): void => {
  const isRent = Number(f.payment_purpose_id) === RENT_PURPOSE_ID;

  if (!isRent) {
    if (f.covers_period_start) {
      throw err('covers_period_start is only valid for a rent payment', 400);
    }
    return;
  }

  if (!f.covers_period_start) {
    throw err('covers_period_start is required for a rent payment', 400);
  }
  if (!isValidPeriodStart(toRentTerms(agreement), dateOnly(f.covers_period_start))) {
    throw err('covers_period_start must fall on a rent period boundary for this Agreement', 400);
  }
};

type PeriodTerms = Pick<AgreementRentTerms, 'start_date' | 'payment_period_id' | 'end_date'>;

// Adds covers_period_end and the BS form of each date to Payment rows, so the
// Ledger can label the period a rent Payment settles the way the Statement
// does (inclusive end, capped at the Agreement's end_date). Non-rent rows get
// null period fields. BS dates are null past the seeded calendar. All
// conversions share one query, since rows share many dates.
const withPeriodDates = async (
  rows: Record<string, any>[],
  termsOf: (row: Record<string, any>) => PeriodTerms
): Promise<Record<string, any>[]> => {
  const dated = rows.map((row) => {
    const start = row.covers_period_start ? dateOnly(row.covers_period_start) : null;
    return { paidOn: dateOnly(row.paid_on), start, end: start ? periodEnd(termsOf(row), start) : null };
  });
  const bs = await toBsMany(dated.flatMap((d) => [d.paidOn, d.start, d.end].filter((x): x is string => !!x)));
  const bsOf = (d: string | null) => (d ? bs.get(d) ?? null : null);

  return rows.map((row, i) => ({
    ...row,
    covers_period_end: dated[i].end,
    covers_period_start_bs: bsOf(dated[i].start),
    covers_period_end_bs: bsOf(dated[i].end),
    paid_on_bs: bsOf(dated[i].paidOn),
  }));
};

// Ledger rows carry their Agreement's terms only to compute the period end.
const ledgerTerms = (row: Record<string, any>): PeriodTerms => ({
  start_date: dateOnly(row.agreement_start_date),
  end_date: row.agreement_end_date ? dateOnly(row.agreement_end_date) : null,
  payment_period_id: row.agreement_payment_period_id,
});

const toLedgerRows = async (rows: Record<string, any>[]): Promise<Record<string, any>[]> =>
  (await withPeriodDates(rows, ledgerTerms)).map(
    ({ agreement_start_date, agreement_end_date, agreement_payment_period_id, ...row }) => row
  );

export const createPayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  body: Record<string, any>
): Promise<Payment> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);
  const f = pickFields(body, PaymentSchema);

  if (Number(f.amount) <= 0) throw err('Amount must be greater than zero', 400);
  validateCoversPeriod(agreement, f);

  return withTransaction(async (client) => {
    const payment = await paymentModel.create({ ...f, agreement_id: agreementId }, client);
    await recordPaymentEvent(ownerId, 'payment.recorded', agreement, payment, client);
    return payment;
  });
};

export const updatePayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string,
  body: Record<string, any>
): Promise<Payment> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);
  const existing = await paymentModel.findById(paymentId);
  if (!existing || existing.agreement_id !== agreementId) throw err('Payment not found', 404);

  const f = pickFields(body, PaymentSchema);
  if (Number(f.amount) <= 0) throw err('Amount must be greater than zero', 400);
  validateCoversPeriod(agreement, f);

  return withTransaction(async (client) => {
    const updated = await paymentModel.update(paymentId, f, client);
    if (!updated) throw err('Payment not found', 404);
    await recordPaymentEvent(ownerId, 'payment.updated', agreement, updated, client);
    return updated;
  });
};

export const deletePayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Payment> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);
  const existing = await paymentModel.findById(paymentId);
  if (!existing || existing.agreement_id !== agreementId) throw err('Payment not found', 404);

  return withTransaction(async (client) => {
    const deleted = await paymentModel.deleteById(paymentId, client);
    if (!deleted) throw err('Payment not found', 404);
    await recordPaymentEvent(ownerId, 'payment.deleted', agreement, deleted, client);
    return deleted;
  });
};

export const getPayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Record<string, any>> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);
  const payment = await paymentModel.findById(paymentId);
  if (!payment || payment.agreement_id !== agreementId) throw err('Payment not found', 404);
  const terms = toRentTerms(agreement);
  return (await withPeriodDates([payment], () => terms))[0];
};

export const getPaymentsForAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>[]> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);
  const terms = toRentTerms(agreement);
  return withPeriodDates(await paymentModel.findByAgreement(agreementId), () => terms);
};

export interface LedgerQuery {
  propertyId?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  all?: boolean;
}

// Ledger (Q17): 25/page by default, capped at 100; ?all=true returns every
// matching row up to a hard 5000-row ceiling for client-side CSV export —
// no server-side file generation.
export const getLedger = async (
  ownerId: string,
  query: LedgerQuery
): Promise<{ data: Record<string, any>[]; total?: number; limit?: number; offset?: number }> => {
  assertDate('from', query.from);
  assertDate('to', query.to);
  const filters = { propertyId: query.propertyId, tenantId: query.tenantId, from: query.from, to: query.to };

  if (query.all) {
    const data = await paymentModel.findLedgerAll(ownerId, filters, 5000);
    return { data: await toLedgerRows(data) };
  }

  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);
  const { rows, total } = await paymentModel.findLedgerPage(ownerId, filters, limit, offset);
  return { data: await toLedgerRows(rows), total, limit, offset };
};

export interface LedgerSummary {
  total_rent_collected: number;
  from: string;
  to: string;
  monthly: { month: string; total: number }[];
  trend?: { month: string; total: number }[];
  by_purpose: { payment_purpose_id: number; payment_purpose: string; total: number }[];
}

export interface LedgerSummaryQuery extends Pick<LedgerQuery, 'propertyId' | 'tenantId' | 'from' | 'to'> {
  trendMonths?: string;
}

const MAX_TREND_MONTHS = 24;

const parseTrendMonths = (value?: string): number | undefined => {
  if (value === undefined) return undefined;
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(n >= 1 && n <= MAX_TREND_MONTHS)) {
    throw err(`trend_months must be an integer from 1 to ${MAX_TREND_MONTHS}`, 400);
  }
  return n;
};

// Zero-fill every Gregorian month in the window so a quiet month renders as
// a zero bar instead of vanishing (dashboard spec, P1). With only one bound
// given, the open end is the first/last month that has data. Never filled
// past the current month: a future month isn't "zero collected", it hasn't
// happened (the default FY window runs to next Ashad).
const zeroFillMonths = (
  monthly: { month: string; total: number }[],
  from?: string,
  to?: string
): { month: string; total: number }[] => {
  const firstDataMonth = monthly.length ? `${monthly[0].month}-01` : undefined;
  const lastDataMonth = monthly.length ? `${monthly[monthly.length - 1].month}-01` : undefined;

  // The cap is today, unless a payment is dated in a later month — that month
  // still keeps its own bar.
  const todayStr = today();
  const cap = lastDataMonth !== undefined && lastDataMonth > todayStr ? lastDataMonth : todayStr;

  const fillFrom = from ?? firstDataMonth;
  let fillTo = lastDataMonth;
  if (to !== undefined) fillTo = to < cap ? to : cap;
  if (!fillFrom || !fillTo || fillFrom > fillTo) return monthly;

  const totals = new Map(monthly.map((m) => [m.month, m.total]));
  return monthKeysBetween(fillFrom, fillTo).map((month) => ({ month, total: totals.get(month) ?? 0 }));
};

// Total Rent Collected + monthly trend (Q18), scoped by the same filters as
// the Ledger table. When neither from nor to is given, defaults to the
// current Fiscal Year rather than an unbounded all-time total. The response's
// from/to are always the effective window: an open end is today (or a later
// rent payment) for `to`, and the earliest rent payment (or `to` itself) for
// `from`.
export const getLedgerSummary = async (ownerId: string, query: LedgerSummaryQuery): Promise<LedgerSummary> => {
  assertDate('from', query.from);
  assertDate('to', query.to);
  const trendMonths = parseTrendMonths(query.trendMonths);

  let { from, to } = query;
  if (!from && !to) {
    const range = await currentFiscalYearRange();
    from = range.from;
    to = range.to;
  }

  const filters = { propertyId: query.propertyId, tenantId: query.tenantId, from, to };
  const summary = await paymentModel.findRentSummary(ownerId, filters);
  const byPurpose = await paymentModel.findPurposeBreakdown(ownerId, filters);

  const todayStr = today();
  const latest = summary.last_paid_on && summary.last_paid_on > todayStr ? summary.last_paid_on : todayStr;
  const effectiveFrom = from ?? summary.first_paid_on ?? (to as string);
  const effectiveTo = to ?? latest;

  const result: LedgerSummary = {
    total_rent_collected: summary.total,
    from: effectiveFrom,
    to: effectiveTo,
    monthly: zeroFillMonths(summary.monthly, from, to),
    by_purpose: byPurpose,
  };
  if (trendMonths !== undefined) {
    result.trend = await getTrend(ownerId, query, trendMonths, effectiveTo, latest);
  }
  return result;
};

// The `trendMonths` Gregorian months ending at the month of `to`, ignoring the
// summary's `from` so a sparkline always has its full length (a FY that began
// last month would otherwise give it one bar). Like zeroFillMonths, it never
// runs past `cap`'s month: today, or a later-dated rent payment.
const getTrend = async (
  ownerId: string,
  query: Pick<LedgerQuery, 'propertyId' | 'tenantId'>,
  trendMonths: number,
  to: string,
  cap: string
): Promise<{ month: string; total: number }[]> => {
  const endMonth = monthOf(to.slice(0, 7) <= cap.slice(0, 7) ? to : cap);
  const trendTo = to < endMonth.to ? to : endMonth.to;
  const trendFrom = monthOf(endMonth.from, -(trendMonths - 1)).from;

  const { monthly } = await paymentModel.findRentSummary(ownerId, {
    propertyId: query.propertyId,
    tenantId: query.tenantId,
    from: trendFrom,
    to: trendTo,
  });
  const totals = new Map(monthly.map((m) => [m.month, m.total]));
  return monthKeysBetween(trendFrom, trendTo).map((month) => ({ month, total: totals.get(month) ?? 0 }));
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// CONTEXT.md "Payment Statement": one row per rent period the Agreement
// expects within the Fiscal Year, up to today — periods not yet due are
// hidden (Q23). Rent In Force is the real, applied value (ADR-0005) and is
// what Arrears is priced at, so nothing on the statement can disagree with
// itself.
export const getStatement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  fiscalYear?: number
): Promise<Record<string, any>> => {
  const agreement = await getOwnedAgreement(ownerId, tenantId, agreementId);

  const fy = fiscalYear !== undefined ? fiscalYear : await currentFiscalYear();
  if (!Number.isInteger(fy)) throw err('fiscal_year must be an integer BS year', 400);

  const terms = toRentTerms(agreement);
  const { from, to } = await fiscalYearRange(fy);
  const todayStr = today();
  const dueTo = todayStr < to ? todayStr : to;

  const periods = dueTo >= from ? expectedPeriods(terms, from, dueTo) : [];

  const allPayments = await paymentModel.findByAgreement(agreementId);
  const rentPayments = allPayments.filter(
    (p) => Number(p.payment_purpose_id) === RENT_PURPOSE_ID && p.covers_period_start
  );

  let arrears = 0;
  const rows = [];
  for (const period of periods) {
    const matching = rentPayments.filter((p) => dateOnly(p.covers_period_start) === period.period_start);
    const paidAmount = round2(matching.reduce((sum, p) => sum + Number(p.amount), 0));
    const { status, outstanding } = settlePeriod(period.rent_in_force, paidAmount);
    arrears += outstanding;

    rows.push({
      period_start: period.period_start,
      period_start_bs: await toBs(period.period_start),
      rent_in_force: period.rent_in_force,
      paid_amount: paidAmount,
      status,
      payments: matching.map((p) => ({
        payment_id: p.payment_id,
        payment_reference: p.payment_reference,
        amount: Number(p.amount),
        paid_on: dateOnly(p.paid_on),
      })),
    });
  }

  return {
    agreement: {
      agreement_id: agreement.agreement_id,
      property_id: agreement.property_id,
      property_name: agreement.property_name,
      tenant_id: agreement.tenant_id,
      tenant_name: [agreement.tenant_first_name, agreement.tenant_last_name].filter(Boolean).join(' ') || null,
      start_date: terms.start_date,
      end_date: terms.end_date,
      rent_amount: Number(agreement.rent_amount),
      security_deposit: agreement.security_deposit != null ? Number(agreement.security_deposit) : null,
      advance_amount: agreement.advance_amount != null ? Number(agreement.advance_amount) : null,
      payment_period: agreement.payment_period,
      status: agreement.status,
    },
    fiscal_year: fy,
    fiscal_year_range: { from, to },
    statement_date: todayStr,
    statement_date_bs: await toBs(todayStr),
    periods: rows,
    arrears: round2(arrears),
  };
};

export interface ArrearsItem {
  agreement_id: string;
  property_id: string;
  property_name: string;
  tenant_id: string;
  tenant_first_name: string | null;
  tenant_last_name: string | null;
  rent_amount: number;
  rent_in_force: number;
  periods_behind: number;
  months_behind: number;
  oldest_unpaid_period: string;
  outstanding: number;
}

// Portfolio Arrears (dashboard spec, P0): everything owed as of today across
// the owner's active Agreements, over each Agreement's whole life — NOT the
// Statement's Fiscal-Year-scoped `arrears`, which only counts periods inside
// one FY. Both price periods through the same settlePeriod(), so for an
// Agreement that started this FY the two numbers agree exactly.
export const getArrears = async (
  ownerId: string,
  query: { propertyId?: string; tenantId?: string }
): Promise<{ as_of: string; total_outstanding: number; overdue_count: number; items: ArrearsItem[] }> => {
  assertUuid('property_id', query.propertyId);
  assertUuid('tenant_id', query.tenantId);

  const asOf = today();
  const agreements = await agreementModel.findByOwner(ownerId, {
    status: 'active',
    propertyId: query.propertyId,
    tenantId: query.tenantId,
  });
  const paidRows = await paymentModel.findRentPaidByPeriod(agreements.map((a) => a.agreement_id));
  const paid = new Map(paidRows.map((r) => [`${r.agreement_id}|${r.period_start}`, r.paid]));

  const items: ArrearsItem[] = [];
  for (const agreement of agreements) {
    const terms = toRentTerms(agreement);
    let outstanding = 0;
    let periodsBehind = 0;
    let oldest: string | null = null;

    for (const period of expectedPeriods(terms, terms.start_date, asOf)) {
      const paidAmount = paid.get(`${agreement.agreement_id}|${period.period_start}`) ?? 0;
      const settled = settlePeriod(period.rent_in_force, paidAmount);
      if (settled.outstanding <= 0) continue;
      outstanding += settled.outstanding;
      periodsBehind += 1;
      oldest = oldest ?? period.period_start;
    }

    if (oldest === null) continue;
    items.push({
      agreement_id: agreement.agreement_id,
      property_id: agreement.property_id,
      property_name: agreement.property_name,
      tenant_id: agreement.tenant_id,
      tenant_first_name: agreement.tenant_first_name ?? null,
      tenant_last_name: agreement.tenant_last_name ?? null,
      rent_amount: Number(agreement.rent_amount),
      rent_in_force: rentInForce(terms, asOf),
      periods_behind: periodsBehind,
      // A partially paid period counts as a whole period behind.
      months_behind: periodsBehind * PAYMENT_PERIOD_MONTHS[terms.payment_period_id],
      oldest_unpaid_period: oldest,
      outstanding: round2(outstanding),
    });
  }

  items.sort((a, b) => b.outstanding - a.outstanding);
  return {
    as_of: asOf,
    total_outstanding: round2(items.reduce((sum, i) => sum + i.outstanding, 0)),
    overdue_count: items.length,
    items,
  };
};
