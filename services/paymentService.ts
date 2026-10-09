import path from 'path';
import * as paymentModel from '../models/payment';
import * as agreementModel from '../models/agreement';
import * as activityModel from '../models/activityEvent';
import * as fileModel from '../models/file';
import * as ownership from './ownership';
import * as fileStore from './fileStore';
import * as userDetailsModel from '../models/userDetails';
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
  lifetimeOutstanding,
  AgreementRentTerms,
} from '../utils/rent';
import { today, monthKeysBetween, monthOf } from '../utils/businessDate';
import { assertDate, assertUuid } from '../utils/validators';
import { currentFiscalYearRange, currentFiscalYear, fiscalYearRange, toBs, toBsMany } from '../utils/nepaliCalendar';
import { Payment, DbClient, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

// Coupled to the seed order in data/payment_purpose.csv (id 1 = rent) — same
// posture as PAYMENT_PERIOD_MONTHS in utils/rent.ts.
const RENT_PURPOSE_ID = 1;

// Agreements and Payments are resolved through services/ownership.ts.
// Deliberately no agreement.status check — a Payment may be recorded against
// an ended Agreement (grill session 2026-08-22): arrears from before move-out
// remain collectible, and covers_period_start's grid check already confines
// it to periods within the Agreement's actual term.

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
  const agreement = await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
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
  const { agreement } = await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });

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
  const { agreement } = await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });

  // The receipt rows would cascade anyway; deleting them here returns their
  // paths, so the stored files go too once the delete commits.
  const { deleted, receiptPaths } = await withTransaction(async (client) => {
    const receiptPaths = await fileModel.deleteByPayment(paymentId, client);
    const deleted = await paymentModel.deleteById(paymentId, client);
    if (!deleted) throw err('Payment not found', 404);
    await recordPaymentEvent(ownerId, 'payment.deleted', agreement, deleted, client);
    return { deleted, receiptPaths };
  });
  fileStore.discard(receiptPaths);
  return deleted;
};

export const getPayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Record<string, any>> => {
  const { agreement, payment } = await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });
  const terms = toRentTerms(agreement);
  return (await withPeriodDates([payment], () => terms))[0];
};

export const getPaymentsForAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>[]> => {
  const agreement = await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
  const terms = toRentTerms(agreement);
  return withPeriodDates(await paymentModel.findByAgreement(agreementId), () => terms);
};

// Payment receipts (payment receipts spec): proof of payment for one Payment,
// stored like Agreement documents — owned by the tenant, in the tenant's
// upload folder. Allowed on ended Agreements, as Payments are.
export const getReceipts = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Record<string, any>[]> => {
  await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });
  return fileModel.findPaymentReceipts(paymentId);
};

export const getReceipt = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string,
  fileId: string
): Promise<Record<string, any>> =>
  ownership.document(ownerId, fileId, { payment: paymentId, agreement: agreementId, tenant: tenantId });

export const uploadReceipts = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string,
  files: MulterFile[]
): Promise<Record<string, any>[]> => {
  const { payment } = await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });
  if (!files.length) throw err('At least one file is required', 400);

  const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId);
  const prefix = `${tenantInfo?.first_name || 'tenant'}_receipt_${payment.payment_reference}_${Date.now()}`;

  return fileStore.save(tenantId, files, async (placed, client) => {
    const records: Record<string, any>[] = [];
    for (const [i, { file, file_path }] of placed.entries()) {
      records.push(await fileModel.createPaymentReceipt({
        user_id: tenantId,
        payment_id: paymentId,
        original_name: file.originalname,
        mimetype: file.mimetype,
        file_size: file.size,
        file_name: `${prefix}_${i + 1}${path.extname(file.originalname)}`,
        file_path,
      }, client));
    }
    return records;
  });
};

export const deleteReceipt = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string,
  fileId: string
): Promise<void> => {
  const file = await getReceipt(ownerId, tenantId, agreementId, paymentId, fileId);
  await fileModel.deleteById(fileId);
  fileStore.discard([file.file_path]);
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
): Promise<Record<string, any>> =>
  buildStatement(await ownership.agreement(ownerId, agreementId, { tenant: tenantId }), fiscalYear);

// Not tenant-scoped, for pages that only carry the agreement id.
export const getStatementByAgreementId = async (
  ownerId: string,
  agreementId: string,
  fiscalYear?: number
): Promise<Record<string, any>> => buildStatement(await ownership.agreement(ownerId, agreementId), fiscalYear);

const buildStatement = async (
  agreement: Record<string, any>,
  fiscalYear?: number
): Promise<Record<string, any>> => {
  const fy = fiscalYear !== undefined ? fiscalYear : await currentFiscalYear();
  if (!Number.isInteger(fy)) throw err('fiscal_year must be an integer BS year', 400);

  const terms = toRentTerms(agreement);
  const { from, to } = await fiscalYearRange(fy);
  const todayStr = today();
  const dueTo = todayStr < to ? todayStr : to;

  const periods = dueTo >= from ? expectedPeriods(terms, from, dueTo) : [];

  // Newest paid_on first (created_at breaking ties), the Ledger's order —
  // findByAgreement returns them that way and filter keeps it.
  const allPayments = await paymentModel.findByAgreement(agreement.agreement_id);
  const rentPayments = allPayments.filter(
    (p) => Number(p.payment_purpose_id) === RENT_PURPOSE_ID && p.covers_period_start
  );
  const paidOnBs = await toBsMany(rentPayments.map((p) => dateOnly(p.paid_on)));

  const paidByPeriod = new Map<string, number>();
  for (const p of rentPayments) {
    const key = dateOnly(p.covers_period_start);
    paidByPeriod.set(key, round2((paidByPeriod.get(key) ?? 0) + Number(p.amount)));
  }

  let arrears = 0;
  const rows = [];
  for (const period of periods) {
    const matching = rentPayments.filter((p) => dateOnly(p.covers_period_start) === period.period_start);
    const paidAmount = paidByPeriod.get(period.period_start) ?? 0;
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
        paid_on_bs: paidOnBs.get(dateOnly(p.paid_on)) ?? null,
        payment_method_id: p.payment_method_id,
        payment_method: p.payment_method,
        remarks: p.remarks ?? null,
        receipt_count: p.receipt_count,
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
    // Whole life, any status, independent of fiscal_year: equals this
    // Agreement's outstanding on GET /arrears while it's active.
    lifetime_arrears: lifetimeOutstanding(terms, paidByPeriod, todayStr).outstanding,
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
  const paid = new Map<string, Map<string, number>>();
  for (const r of paidRows) {
    if (!paid.has(r.agreement_id)) paid.set(r.agreement_id, new Map());
    paid.get(r.agreement_id)!.set(r.period_start, r.paid);
  }

  const items: ArrearsItem[] = [];
  for (const agreement of agreements) {
    const terms = toRentTerms(agreement);
    const owed = lifetimeOutstanding(terms, paid.get(agreement.agreement_id) ?? new Map(), asOf);
    if (owed.oldest_unpaid_period === null) continue;
    items.push({
      agreement_id: agreement.agreement_id,
      property_id: agreement.property_id,
      property_name: agreement.property_name,
      tenant_id: agreement.tenant_id,
      tenant_first_name: agreement.tenant_first_name ?? null,
      tenant_last_name: agreement.tenant_last_name ?? null,
      rent_amount: Number(agreement.rent_amount),
      rent_in_force: rentInForce(terms, asOf),
      periods_behind: owed.periods_behind,
      months_behind: owed.periods_behind * PAYMENT_PERIOD_MONTHS[terms.payment_period_id],
      oldest_unpaid_period: owed.oldest_unpaid_period,
      outstanding: owed.outstanding,
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
