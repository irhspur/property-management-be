import fs from 'fs';
import path from 'path';
import * as agreementModel from '../models/agreement';
import * as propertyModel from '../models/property';
import * as ownerTenantModel from '../models/ownerTenant';
import * as userDetailsModel from '../models/userDetails';
import * as activityModel from '../models/activityEvent';
import * as fileModel from '../models/file';
import pool from '../config/database';
import { withTransaction } from '../utils/transaction';
import { assertDate, assertUuid, isUuid } from '../utils/validators';
import { rentSchedule, toRentTerms } from '../utils/rent';
import { toBs, BsDate } from '../utils/nepaliCalendar';
import { generatePhotoToken } from '../utils/viewToken';
import { pickFields, AgreementSchema } from '../schemas/index';
import { Agreement, FileRecord, MulterFile } from '../types';

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

  const propertyName = await propertyModel.findNameById(f.property_id);
  const tenantDetails = await userDetailsModel.findByUserId(tenantId);

  return withTransaction(async (client) => {
    const agreement = await agreementModel.create({ ...f, tenant_id: tenantId }, ownerId, client);
    await propertyModel.setVacancy(f.property_id, false, client);
    await activityModel.record(
      {
        ownerId,
        type: 'agreement.created',
        subjectKind: 'agreement',
        subjectId: agreement.agreement_id,
        context: {
          property_name: propertyName,
          tenant_name: activityModel.displayName(tenantDetails?.first_name, tenantDetails?.last_name),
        },
      },
      client
    );
    return agreement;
  });
};

// All filters optional and AND-combined (dashboard spec, P2).
export const getAgreementsByOwner = async (
  ownerId: string,
  query: agreementModel.AgreementFilters = {}
): Promise<Record<string, any>[]> => {
  if (query.status !== undefined && query.status !== 'active' && query.status !== 'ended') {
    throw err("status must be 'active' or 'ended'", 400);
  }
  assertDate('ending_before', query.endingBefore);
  assertUuid('property_id', query.propertyId);
  assertUuid('tenant_id', query.tenantId);
  return agreementModel.findByOwner(ownerId, query);
};

export const getAgreementsForTenant = async (
  ownerId: string,
  tenantId: string
): Promise<Record<string, any>[]> => {
  await assertLinked(ownerId, tenantId);
  return agreementModel.findByOwnerAndTenant(ownerId, tenantId);
};

// BsDate, or null past the seeded calendar (BS 2090) — a long lease's later
// steps can run beyond it.
const toBsOrNull = async (adDate: string): Promise<BsDate | null> => {
  try {
    return await toBs(adDate);
  } catch (e) {
    if ((e as any).statusCode === 400) return null;
    throw e;
  }
};

// The Agreement Details payload: the row plus its rent schedule, with the
// tenant's photo path swapped for a signed URL.
const toDetail = async (row: Record<string, any>, baseUrl: string): Promise<Record<string, any>> => {
  const { tenant_profile_photo_path, ...agreement } = row;
  const steps = rentSchedule(toRentTerms(row), row.agreement_duration_in_years);
  const rent_schedule = [];
  for (const step of steps) {
    rent_schedule.push({
      index: step.index,
      start_date: step.start_date,
      end_date: step.end_date,
      start_date_bs: await toBsOrNull(step.start_date),
      end_date_bs: await toBsOrNull(step.end_date),
      rent_in_force: step.rent_in_force,
    });
  }
  return {
    ...agreement,
    tenant_profile_photo_url: tenant_profile_photo_path
      ? `${baseUrl}/files/view/${generatePhotoToken(row.tenant_id)}`
      : null,
    rent_schedule,
  };
};

export const getAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  baseUrl: string
): Promise<Record<string, any>> => {
  await assertLinked(ownerId, tenantId);
  if (!isUuid(agreementId)) throw err('Agreement not found', 404);
  const agreement = await agreementModel.findDetailById(agreementId);
  if (!agreement) throw err('Agreement not found', 404);
  assertOwnsAgreement(agreement, ownerId, tenantId);
  return toDetail(agreement, baseUrl);
};

// Not tenant-scoped, for deep links that only carry the agreement id. Someone
// else's Agreement is a 404, not a 403, so ids can't be probed.
export const getAgreementById = async (
  ownerId: string,
  agreementId: string,
  baseUrl: string
): Promise<Record<string, any>> => {
  if (!isUuid(agreementId)) throw err('Agreement not found', 404);
  const agreement = await agreementModel.findDetailById(agreementId);
  if (!agreement || agreement.property_owner_id !== ownerId) throw err('Agreement not found', 404);
  return toDetail(agreement, baseUrl);
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
    const ended = await agreementModel.end(agreementId, ownerId, client);
    if (!ended) throw err('Agreement is not active', 400);
    await propertyModel.setVacancy(agreement.property_id, true, client);
    // The ending action itself is the event — not the row's updated_at, which
    // any later edit would bump (dashboard spec, P1).
    await activityModel.record(
      {
        ownerId,
        type: 'agreement.ended',
        subjectKind: 'agreement',
        subjectId: agreementId,
        context: {
          property_name: agreement.property_name,
          tenant_name: activityModel.displayName(agreement.tenant_first_name, agreement.tenant_last_name),
        },
      },
      client
    );
    return ended;
  });
};

// Agreement documents (e.g. the signed contract). Owned by the tenant and
// stored in the tenant's upload folder, like tenant documents, so removing the
// tenant removes them. Allowed on ended Agreements too.

const getOwnedAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>> => {
  await assertLinked(ownerId, tenantId);
  if (!isUuid(agreementId)) throw err('Agreement not found', 404);
  const agreement = await agreementModel.findById(agreementId);
  if (!agreement) throw err('Agreement not found', 404);
  assertOwnsAgreement(agreement, ownerId, tenantId);
  return agreement;
};

export const getFiles = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>[]> => {
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  return fileModel.findAgreementFiles(agreementId);
};

export const getFile = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  fileId: string
): Promise<Record<string, any>> => {
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  const file = isUuid(fileId) ? await fileModel.findAgreementFileById(fileId, agreementId) : null;
  if (!file) throw err('File not found', 404);
  return file;
};

export const uploadFiles = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  files: MulterFile[],
  categoryId: unknown
): Promise<Record<string, any>[]> => {
  await getOwnedAgreement(ownerId, tenantId, agreementId);
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id < 1) throw err('agreement_file_category_id is required', 400);
  const { rows } = await pool.query<{ name: string; code: string }>(
    'SELECT name, code FROM agreement_file_categories WHERE id = $1',
    [id]
  );
  const category = rows[0];
  if (!category) throw err('agreement_file_category_id does not exist', 400);

  const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId);
  const uploadDir = path.join('uploads', tenantInfo?.mobile_number || tenantId);
  const prefix = `${tenantInfo?.first_name || 'tenant'}_${category.code}_${Date.now()}`;
  const written: string[] = [];

  try {
    const created = await withTransaction(async (client) => {
      fs.mkdirSync(uploadDir, { recursive: true });
      const records: FileRecord[] = [];
      for (const [i, file] of files.entries()) {
        const fileName = `${prefix}_${i + 1}${path.extname(file.originalname)}`;
        const filePath = path.join(uploadDir, fileName);
        records.push(await fileModel.createAgreementFile({
          user_id: tenantId,
          agreement_id: agreementId,
          agreement_file_category_id: id,
          original_name: file.originalname,
          mimetype: file.mimetype,
          file_size: file.size,
          file_name: fileName,
          file_path: filePath,
        }, client));
        fs.writeFileSync(filePath, file.buffer);
        written.push(filePath);
      }
      return records;
    });
    return created.map((f) => ({
      ...f,
      file_category_name: category.name,
      file_category_code: category.code,
    }));
  } catch (e) {
    for (const p of written) fs.rmSync(p, { force: true });
    throw e;
  }
};

export const deleteFile = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  fileId: string
): Promise<void> => {
  const file = await getFile(ownerId, tenantId, agreementId, fileId);
  await fileModel.deleteById(fileId);
  if (file.file_path) fs.rmSync(file.file_path, { force: true });
};
