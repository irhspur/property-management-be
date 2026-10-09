import path from 'path';
import * as agreementModel from '../models/agreement';
import * as propertyModel from '../models/property';
import * as userDetailsModel from '../models/userDetails';
import * as activityModel from '../models/activityEvent';
import * as fileModel from '../models/file';
import * as ownership from './ownership';
import * as fileStore from './fileStore';
import pool from '../config/database';
import { withTransaction } from '../utils/transaction';
import { assertDate, assertUuid } from '../utils/validators';
import { rentSchedule, rentInForceOn, toRentTerms, dateOnly, PAYMENT_PERIOD_MONTHS } from '../utils/rent';
import { today, addDays, monthOf, Period } from '../utils/businessDate';
import { ENDING_SOON_DAYS } from './dashboardService';
import { toBsOrNull } from '../utils/nepaliCalendar';
import { pickFields, AgreementSchema } from '../schemas/index';
import { Agreement, FileRecord, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const createAgreement = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<Agreement> => {
  await ownership.tenant(ownerId, tenantId);
  const f = pickFields(body, AgreementSchema);
  const property = await ownership.property(ownerId, f.property_id);

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

  const propertyName = property.property_name;
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

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Kathmandu date 30 days out: on or before it, an active Agreement is
// expiring — the dashboard's ending_within_30_days rule.
const expiringBoundary = (): string => addDays(today(), ENDING_SOON_DAYS);

const photoUrl = (row: Record<string, any>, baseUrl: string): string | null =>
  fileStore.photoUrl(row.tenant_id, row.tenant_profile_photo_path, baseUrl);

// A list row as returned: current rent and the expiring flag added, the
// photo path swapped for a signed URL.
const toListRow = (row: Record<string, any>, asOf: string, boundary: string, baseUrl: string) => {
  const { tenant_profile_photo_path, ...rest } = row;
  return {
    ...rest,
    rent_in_force_today: rentInForceOn(toRentTerms(row), asOf),
    is_expiring: row.status === 'active' && !!row.end_date && dateOnly(row.end_date) <= boundary,
    tenant_profile_photo_url: photoUrl(row, baseUrl),
  };
};

export type AgreementListSort = agreementModel.AgreementSort | 'rent_desc';

export interface AgreementListQuery {
  q?: string;
  status?: string;
  endingBefore?: string;
  propertyId?: string;
  tenantId?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

const STATUSES = ['active', 'expiring', 'ended'];
const SORTS = ['newest', 'ending_soonest', 'rent_desc'];

// All filters optional and AND-combined. Without `limit`, the full matching
// list (unchanged shape for older clients); with it, a page plus the full
// match count, like the tenants list.
export const getAgreementsByOwner = async (
  ownerId: string,
  baseUrl: string,
  query: AgreementListQuery = {}
): Promise<{ data: Record<string, any>[]; total?: number; limit?: number; offset?: number }> => {
  if (query.status !== undefined && !STATUSES.includes(query.status)) {
    throw err('status must be one of: active, expiring, ended', 400);
  }
  if (query.sort !== undefined && !SORTS.includes(query.sort)) {
    throw err('sort must be one of: newest, ending_soonest, rent_desc', 400);
  }
  assertDate('ending_before', query.endingBefore);
  assertUuid('property_id', query.propertyId);
  assertUuid('tenant_id', query.tenantId);

  const asOf = today();
  const boundary = addDays(asOf, ENDING_SOON_DAYS);
  const filters: agreementModel.AgreementFilters = {
    status: query.status as agreementModel.AgreementFilters['status'],
    expiringOnOrBefore: boundary,
    endingBefore: query.endingBefore,
    propertyId: query.propertyId,
    tenantId: query.tenantId,
    q: query.q || undefined,
  };
  const toRow = (r: Record<string, any>) => toListRow(r, asOf, boundary, baseUrl);
  const { limit } = query;
  const offset = query.offset ?? 0;

  // Rent In Force isn't stored, so this sort pages in memory.
  if (query.sort === 'rent_desc') {
    const rows = (await agreementModel.findByOwner(ownerId, filters)).map(toRow);
    rows.sort((x, y) => y.rent_in_force_today - x.rent_in_force_today);
    if (limit === undefined) return { data: rows };
    return { data: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
  }

  const sort = query.sort as agreementModel.AgreementSort | undefined;
  if (limit === undefined) {
    return { data: (await agreementModel.findByOwner(ownerId, filters, { sort })).map(toRow) };
  }
  const [rows, total] = await Promise.all([
    agreementModel.findByOwner(ownerId, filters, { sort, limit, offset }),
    agreementModel.countByOwner(ownerId, filters),
  ]);
  return { data: rows.map(toRow), total, limit, offset };
};

export const getAgreementsForTenant = async (
  ownerId: string,
  tenantId: string,
  baseUrl: string
): Promise<Record<string, any>[]> => {
  await ownership.tenant(ownerId, tenantId);
  const asOf = today();
  const boundary = expiringBoundary();
  const rows = await agreementModel.findByOwner(ownerId, { tenantId });
  return rows.map((r) => toListRow(r, asOf, boundary, baseUrl));
};

export interface AgreementSummary {
  period: Period;
  as_of: string;
  total: number;
  added_this_month: number;
  active: number;
  ending_within_30_days: number;
  security_deposit_total: number;
  monthly_rent_roll: number;
}

// Counters for the agreements page, which can't count a paged list. Same
// period and expiring rule as the dashboard.
export const getSummary = async (ownerId: string): Promise<AgreementSummary> => {
  const asOf = today();
  const period = monthOf(asOf);
  const [counts, active] = await Promise.all([
    agreementModel.countsByOwner(ownerId, expiringBoundary(), period),
    agreementModel.findByOwner(ownerId, { status: 'active' }),
  ]);
  // Each agreement's current rent spread over the months its period covers.
  const rentRoll = active.reduce(
    (sum, a) => sum + rentInForceOn(toRentTerms(a), asOf) / PAYMENT_PERIOD_MONTHS[a.payment_period_id],
    0
  );
  return {
    period,
    as_of: asOf,
    total: counts.total,
    added_this_month: counts.added_in_period,
    active: counts.active,
    ending_within_30_days: counts.ending_soon,
    security_deposit_total: counts.security_deposit_total,
    monthly_rent_roll: round2(rentRoll),
  };
};

// The Agreement Details payload: the row plus its rent schedule, with the
// tenant's photo path swapped for a signed URL. Current rent and the expiring
// flag are computed as on list rows. `current` marks the step containing
// today (Kathmandu): before the term, the first step; after it, the last.
const toDetail = async (row: Record<string, any>, baseUrl: string): Promise<Record<string, any>> => {
  const { tenant_profile_photo_path, ...agreement } = row;
  const asOf = today();
  const steps = rentSchedule(toRentTerms(row), row.agreement_duration_in_years);
  let currentIndex = steps.findIndex((s) => s.start_date <= asOf && asOf <= s.end_date);
  if (currentIndex === -1 && steps.length) currentIndex = asOf < steps[0].start_date ? 0 : steps.length - 1;

  const rent_schedule = [];
  for (const [i, step] of steps.entries()) {
    rent_schedule.push({
      index: step.index,
      start_date: step.start_date,
      end_date: step.end_date,
      start_date_bs: await toBsOrNull(step.start_date),
      end_date_bs: await toBsOrNull(step.end_date),
      rent_in_force: step.rent_in_force,
      current: i === currentIndex,
    });
  }
  return {
    ...agreement,
    rent_in_force_today: rentInForceOn(toRentTerms(row), asOf),
    is_expiring: row.status === 'active' && !!row.end_date && dateOnly(row.end_date) <= expiringBoundary(),
    tenant_profile_photo_url: photoUrl(row, baseUrl),
    rent_schedule,
  };
};

export const getAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  baseUrl: string
): Promise<Record<string, any>> => {
  await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
  return toDetail((await agreementModel.findDetailById(agreementId))!, baseUrl);
};

// Not tenant-scoped, for deep links that only carry the agreement id.
export const getAgreementById = async (
  ownerId: string,
  agreementId: string,
  baseUrl: string
): Promise<Record<string, any>> => {
  await ownership.agreement(ownerId, agreementId);
  return toDetail((await agreementModel.findDetailById(agreementId))!, baseUrl);
};

export const endAgreement = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Agreement> => {
  const agreement = await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
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

export const getFiles = async (
  ownerId: string,
  tenantId: string,
  agreementId: string
): Promise<Record<string, any>[]> => {
  await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
  return fileModel.findAgreementFiles(agreementId);
};

export const getFile = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  fileId: string
): Promise<Record<string, any>> => ownership.document(ownerId, fileId, { agreement: agreementId, tenant: tenantId });

export const uploadFiles = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  files: MulterFile[],
  categoryId: unknown
): Promise<Record<string, any>[]> => {
  await ownership.agreement(ownerId, agreementId, { tenant: tenantId });
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id < 1) throw err('agreement_file_category_id is required', 400);
  const { rows } = await pool.query<{ name: string; code: string }>(
    'SELECT name, code FROM agreement_file_categories WHERE id = $1',
    [id]
  );
  const category = rows[0];
  if (!category) throw err('agreement_file_category_id does not exist', 400);

  const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId);
  const prefix = `${tenantInfo?.first_name || 'tenant'}_${category.code}_${Date.now()}`;

  const created = await fileStore.save(tenantId, files, async (placed, client) => {
    const records: FileRecord[] = [];
    for (const [i, { file, file_path }] of placed.entries()) {
      records.push(await fileModel.createAgreementFile({
        user_id: tenantId,
        agreement_id: agreementId,
        agreement_file_category_id: id,
        original_name: file.originalname,
        mimetype: file.mimetype,
        file_size: file.size,
        file_name: `${prefix}_${i + 1}${path.extname(file.originalname)}`,
        file_path,
      }, client));
    }
    return records;
  });
  return created.map((f) => ({
    ...f,
    file_category_name: category.name,
    file_category_code: category.code,
  }));
};

export const deleteFile = async (
  ownerId: string,
  tenantId: string,
  agreementId: string,
  fileId: string
): Promise<void> => {
  const file = await getFile(ownerId, tenantId, agreementId, fileId);
  await fileModel.deleteById(fileId);
  fileStore.discard([file.file_path]);
};
