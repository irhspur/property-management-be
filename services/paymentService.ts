import * as paymentModel from '../models/payment';
import * as agreementModel from '../models/agreement';
import * as ownerTenantModel from '../models/ownerTenant';
import { pickFields, PaymentSchema } from '../schemas/index';
import { isValidPeriodStart, expectedPeriods, AgreementRentTerms } from '../utils/rent';
import { currentFiscalYearRange, currentFiscalYear, fiscalYearRange, toBs } from '../utils/nepaliCalendar';
import { Payment } from '../types';

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

  return paymentModel.create({ ...f, agreement_id: agreementId });
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

  const updated = await paymentModel.update(paymentId, f);
  if (!updated) throw err('Payment not found', 404);
  return updated;
};

export const deletePayment = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Payment> => {
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  const existing = await paymentModel.findById(paymentId);
  if (!existing || existing.agreement_id !== agreementId) throw err('Payment not found', 404);

  const deleted = await paymentModel.deleteById(paymentId);
  if (!deleted) throw err('Payment not found', 404);
  return deleted;
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const validateDateFilter = (label: string, value?: string): void => {
  if (value !== undefined && !DATE_RE.test(value)) {
    throw err(`${label} must be a date in YYYY-MM-DD format`, 400);
  }
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
  validateDateFilter('from', query.from);
  validateDateFilter('to', query.to);
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

// Total Rent Collected + monthly trend (Q18), scoped by the same filters as
// the Ledger table. When neither from nor to is given, defaults to the
// current Fiscal Year rather than an unbounded all-time total.
export const getLedgerSummary = async (
  ownerId: string,
  query: Pick<LedgerQuery, 'propertyId' | 'tenantId' | 'from' | 'to'>
): Promise<{ total_rent_collected: number; from: string; to: string; monthly: { month: string; total: number }[] }> => {
  validateDateFilter('from', query.from);
  validateDateFilter('to', query.to);

  let { from, to } = query;
  if (!from && !to) {
    const range = await currentFiscalYearRange();
    from = range.from;
    to = range.to;
  }

  const summary = await paymentModel.findRentSummary(ownerId, {
    propertyId: query.propertyId,
    tenantId: query.tenantId,
    from,
    to,
  });
  return { total_rent_collected: summary.total, from: from as string, to: to as string, monthly: summary.monthly };
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
  const todayStr = dateOnly(new Date());
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
    const status = paidAmount <= 0 ? 'unpaid' : paidAmount < period.rent_in_force ? 'partial' : 'paid';
    arrears += Math.max(0, period.rent_in_force - paidAmount);

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
