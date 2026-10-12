// The tenant portal (/tenant): a Tenant reading their own records. Every
// record is resolved with ownership.byTenant, then handed to the same payload
// builder the owner routes use, so the two can't drift (spec decision 11).
import * as agreementModel from '../models/agreement';
import * as agreementService from './agreementService';
import * as paymentService from './paymentService';
import { byTenant } from './ownership';
import { nextDue, toRentTerms } from '../utils/rent';
import { today } from '../utils/businessDate';
import { toBsOrNull } from '../utils/nepaliCalendar';

export const getAgreements = async (tenantId: string, baseUrl: string): Promise<Record<string, any>[]> =>
  agreementService.toListRows(await agreementModel.findByTenant(tenantId), baseUrl);

// The owner's Agreement Details payload, with who created and last changed it
// hidden (spec decision 13), plus GLOSSARY.md "Next Due Date".
export const getAgreement = async (
  tenantId: string,
  agreementId: string,
  baseUrl: string
): Promise<Record<string, any>> => {
  const agreement = await byTenant.agreement(tenantId, agreementId);
  const detail = await agreementService.detailFor(agreement, baseUrl);
  const next = nextDue(toRentTerms(agreement), agreement.agreement_duration_in_years, agreement.status, today());
  return {
    ...detail,
    created_by_name: null,
    updated_by_name: null,
    next_due_date: next?.period_start ?? null,
    next_due_date_bs: next ? await toBsOrNull(next.period_start) : null,
    next_due_rent: next?.rent_in_force ?? null,
  };
};

// The owner's Payment Statement, with the same Fiscal Year defaulting.
export const getStatement = async (
  tenantId: string,
  agreementId: string,
  fiscalYear?: number
): Promise<Record<string, any>> =>
  paymentService.buildStatement(await byTenant.agreement(tenantId, agreementId), fiscalYear);

// Payments, Payment Receipts and Agreement Documents (ticket 04): the owner's
// lists and files for a record resolved as the Tenant's.
export const getPayments = async (tenantId: string, agreementId: string): Promise<Record<string, any>[]> =>
  paymentService.paymentsFor(await byTenant.agreement(tenantId, agreementId));

export const getReceipts = async (
  tenantId: string,
  agreementId: string,
  paymentId: string
): Promise<Record<string, any>[]> =>
  paymentService.receiptsFor((await byTenant.payment(tenantId, paymentId, { agreement: agreementId })).payment);

export const getReceipt = (
  tenantId: string,
  agreementId: string,
  paymentId: string,
  fileId: string
): Promise<Record<string, any>> => byTenant.document(tenantId, fileId, { payment: paymentId, agreement: agreementId });
