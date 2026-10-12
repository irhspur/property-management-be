// The tenant portal (/tenant): a Tenant reading their own records. Every
// record is resolved with ownership.byTenant, then handed to the same payload
// builder the owner routes use, so the two can't drift (spec decision 11).
import * as agreementModel from '../models/agreement';
import * as agreementService from './agreementService';
import * as paymentService from './paymentService';
import * as fileModel from '../models/file';
import * as fileStore from './fileStore';
import * as ownerTenantModel from '../models/ownerTenant';
import * as userModel from '../models/user';
import * as tenantService from './tenantService';
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

// The Tenant themselves: personal Documents, profile, Property Owner card.

// The rows GET /property-owner/tenant/:tenantId/files gives for this Tenant.
export const getFiles = async (tenantId: string): Promise<Record<string, any>[]> =>
  fileModel.findTenantFiles(tenantId);

export const getFileViewUrl = async (tenantId: string, fileId: string, baseUrl: string): Promise<{ url: string }> => {
  const file = await byTenant.document(tenantId, fileId, { self: true });
  return { url: fileStore.viewUrl(file, baseUrl) };
};

const ownerNotFound = (): Error => Object.assign(new Error('Property Owner not found'), { statusCode: 404 });

// Spec decision 12: the owner of the first Agreement in GET /tenant/agreements
// order, else the most recently linked one. 404 with neither.
const ownerOf = async (tenantId: string): Promise<string> => {
  const [first] = await agreementModel.findByTenant(tenantId);
  const ownerId = first?.property_owner_id ?? (await ownerTenantModel.findLatestOwnerId(tenantId));
  if (!ownerId) throw ownerNotFound();
  return ownerId;
};

// authService.login's rule: a password expires a year after it last changed.
const passwordExpiresOn = (lastChanged: Date | null): Date | null => {
  if (!lastChanged) return null;
  const expiry = new Date(lastChanged);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
};

// GET /property-owner/tenant/:tenantId as the owner of the owner card sees
// it, plus when the Tenant's password last changed and when it expires.
export const getProfile = async (tenantId: string, baseUrl: string): Promise<Record<string, any>> => {
  const profile = await tenantService.getTenant(await ownerOf(tenantId), tenantId, baseUrl);
  const user = await userModel.findById(tenantId);
  const lastChanged = user?.password_last_changed ?? null;
  return { ...profile, password_last_changed: lastChanged, password_expires_on: passwordExpiresOn(lastChanged) };
};

export const getOwner = async (
  tenantId: string,
  baseUrl: string
): Promise<{ first_name: string; last_name: string; profile_photo_url: string | null; mobile_number: string; email: string }> => {
  const ownerId = await ownerOf(tenantId);
  const card = await userModel.findContactCard(ownerId);
  if (!card) throw ownerNotFound();
  return {
    first_name: card.first_name,
    last_name: card.last_name,
    profile_photo_url: fileStore.photoUrl(ownerId, card.profile_photo_path, baseUrl),
    mobile_number: card.mobile_number,
    email: card.email,
  };
};
