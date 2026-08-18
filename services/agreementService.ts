import * as agreementModel from '../models/agreement';
import * as propertyModel from '../models/property';
import * as ownerTenantModel from '../models/ownerTenant';
import { withTransaction } from '../utils/transaction';
import { pickFields, AgreementSchema } from '../schemas/index';
import { Agreement } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

const assertLinked = async (ownerId: string, tenantId: string): Promise<void> => {
  const linked = await ownerTenantModel.findLink(ownerId, tenantId);
  if (!linked) throw err('You are not allowed to perform this action on this tenant', 403);
};

const assertOwnsAgreement = (
  agreement: Record<string, any>,
  ownerId: string,
  tenantId: string
): void => {
  if (agreement.property_owner_id !== ownerId || agreement.tenant_id !== tenantId) {
    throw err('You are not allowed to perform this action on this agreement', 403);
  }
};

export const createAgreement = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<Agreement> => {
  await assertLinked(ownerId, tenantId);
  const f = pickFields(body, AgreementSchema);

  const vacancy = await propertyModel.checkVacancy(f.property_id, ownerId);
  if (!vacancy) throw err('Property not found or unauthorized', 404);

  const activeOnProperty = await agreementModel.findActiveByProperty(f.property_id);
  if (activeOnProperty) throw err('Property already has an active agreement', 400);

  const activeForTenant = await agreementModel.findActiveByTenant(tenantId);
  if (activeForTenant) throw err('Tenant already has an active agreement', 400);

  if (f.end_date && new Date(f.end_date) <= new Date(f.start_date)) {
    throw err('End date must be after start date', 400);
  }

  if (!!f.increment_duration_id !== !!f.increment_percentage_id) {
    throw err('Increment duration and increment percentage must be provided together', 400);
  }

  return withTransaction(async (client) => {
    const agreement = await agreementModel.create({ ...f, tenant_id: tenantId }, client);
    await propertyModel.setVacancy(f.property_id, false, client);
    return agreement;
  });
};

export const getAgreementsByOwner = async (ownerId: string): Promise<Record<string, any>[]> =>
  agreementModel.findByOwner(ownerId);

export const getAgreementsForTenant = async (
  ownerId: string,
  tenantId: string
): Promise<Record<string, any>[]> => {
  await assertLinked(ownerId, tenantId);
  return agreementModel.findByOwnerAndTenant(ownerId, tenantId);
};

export const getAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>> => {
  await assertLinked(ownerId, tenantId);
  const agreement = await agreementModel.findById(agreementId);
  if (!agreement) throw err('Agreement not found', 404);
  assertOwnsAgreement(agreement, ownerId, tenantId);
  return agreement;
};

export const endAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Agreement> => {
  await assertLinked(ownerId, tenantId);
  const agreement = await agreementModel.findById(agreementId);
  if (!agreement) throw err('Agreement not found', 404);
  assertOwnsAgreement(agreement, ownerId, tenantId);
  if (agreement.status !== 'active') throw err('Agreement is not active', 400);

  return withTransaction(async (client) => {
    const ended = await agreementModel.end(agreementId, client);
    if (!ended) throw err('Agreement is not active', 400);
    await propertyModel.setVacancy(agreement.property_id, true, client);
    return ended;
  });
};
