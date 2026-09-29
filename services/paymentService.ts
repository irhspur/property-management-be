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
  AgreementRentTerms,
} from '../utils/rent';
import { today, monthKeysBetween } from '../utils/businessDate';
import { assertDate, assertUuid } from '../utils/validators';
import { currentFiscalYearRange, currentFiscalYear, fiscalYearRange, toBs } from '../utils/nepaliCalendar';
import { Payment, DbClient } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

// Coupled to the seed order in data/payment_purpose.csv (id 1 = rent) — same
// posture as PAYMENT_PERIOD_MONTHS in utils/rent.ts.
const RENT_PURPOSE_ID = 1;

// pg has no custom type parser registered (config/database.js), so a DATE
// column comes back as a JS Date built from LOCAL date components (see
// postgres-date), not a string. utils/rent.ts works entirely in AD
// 'YYYY-MM-DD' strings, so every date crossing that boundary must be
// normalised here using local getters — the same ones pg used to build the
// Date — never toISOString(), which can roll the calendar day for
// timezones east of UTC.
const dateOnly = (d: Date | string): string => {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toRentTerms = (agreement: Record<string, any>): AgreementRentTerms => ({
  start_date: dateOnly(agreement.start_date),
  end_date: agreement.end_date ? dateOnly(agreement.end_date) : null,
  rent_amount: agreement.rent_amount,
  payment_period_id: agreement.payment_period_id,
  increment_duration_in_years: agreement.increment_duration_in_years,
  increment_percentage: agreement.increment_percentage,
});

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
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  const payment = await paymentModel.findById(paymentId);
  if (!payment || payment.agreement_id !== agreementId) throw err('Payment not found', 404);
  return payment;
};

export const getPaymentsForAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>[]> => {
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  return paymentModel.findByAgreement(agreementId);
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
    return { data };
  }

  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);
  const { rows, total } = await paymentModel.findLedgerPage(ownerId, filters, limit, offset);
  return { data: rows, total, limit, offset };
};

export interface LedgerSummary {
  total_rent_collected: number;
  from: string;
  to: string;
  monthly: { month: string; total: number }[];
  by_purpose: { payment_purpose_id: number; payment_purpose: string; total: number }[];
}

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
// current Fiscal Year rather than an unbounded all-time total.
export const getLedgerSummary = async (
  ownerId: string,
  query: Pick<LedgerQuery, 'propertyId' | 'tenantId' | 'from' | 'to'>
): Promise<LedgerSummary> => {
  assertDate('from', query.from);
  assertDate('to', query.to);

  let { from, to } = query;
  if (!from && !to) {
    const range = await currentFiscalYearRange();
    from = range.from;
    to = range.to;
  }

  const filters = { propertyId: query.propertyId, tenantId: query.tenantId, from, to };
  const summary = await paymentModel.findRentSummary(ownerId, filters);
  const byPurpose = await paymentModel.findPurposeBreakdown(ownerId, filters);

  return {
    total_rent_collected: summary.total,
    from: from as string,
    to: to as string,
    monthly: zeroFillMonths(summary.monthly, from, to),
    by_purpose: byPurpose,
  };
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
