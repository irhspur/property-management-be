import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import * as userModel from '../models/user';
import * as userDetailsModel from '../models/userDetails';
import * as addressModel from '../models/address';
import * as ownerTenantModel from '../models/ownerTenant';
import * as fileModel from '../models/file';
import * as activityModel from '../models/activityEvent';
import { withTransaction } from '../utils/transaction';
import { today, addDays } from '../utils/businessDate';
import { generatePhotoToken } from '../utils/viewToken';
import { ENDING_SOON_DAYS } from './dashboardService';
import { TenancyStatus } from '../models/ownerTenant';
import { pickFields, UserDetailsSchema, AddressSchema } from '../schemas/index';
import { User, UserDetails, Address, FileRecord, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

const assertLinked = async (ownerId: string, tenantId: string): Promise<void> => {
  const linked = await ownerTenantModel.findLink(ownerId, tenantId);
  if (!linked) throw err('You are not allowed to perform this action on this tenant', 403);
};

export const createTenant = async (
  ownerId: string,
  body: Record<string, any>
): Promise<{ tenant: Omit<User, 'password'>; tenantDetails: UserDetails; tenantAddress: Address }> => {
  const { email, password, user_type_id } = body;
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: 'country_id' });
  const a = pickFields(body, AddressSchema, { address_country_id: 'country_id' });

  return withTransaction(async (client: PoolClient) => {
    const existing = await userModel.findByEmail(email);
    if (existing) throw err('User already exists', 400);

    const mobileExists = await userDetailsModel.findByMobileNumber(d.mobile_number, client);
    if (mobileExists) throw err('Mobile Number already exists', 400);

    const tenant = await userModel.create({ email, password, user_type_id }, client);
    const tenantId = tenant.user_id;

    const details = await userDetailsModel.insert(tenantId, d, client);
    const address = await addressModel.insert(tenantId, a, client);

    await ownerTenantModel.assertUserIsTenant(tenantId, client);
    await ownerTenantModel.link(ownerId, tenantId, client);
    await activityModel.record(
      {
        ownerId,
        type: 'tenant.linked',
        subjectKind: 'tenant',
        subjectId: tenantId,
        context: { tenant_name: activityModel.displayName(details.first_name, details.last_name) },
      },
      client
    );

    return { tenant: userModel.toSafeUser(tenant), tenantDetails: details, tenantAddress: address };
  });
};

// Kathmandu date 30 days out: on or before it, an active Agreement is `expiring`.
const expiringBoundary = (): string => addDays(today(), ENDING_SOON_DAYS);

// Swaps the stored path for a signed /files/view URL; the path never leaves the server.
const withPhotoUrl = (row: Record<string, any>, baseUrl: string): Record<string, any> => {
  const { profile_photo_path, ...rest } = row;
  const userId = row.tenant_id ?? row.user_id;
  return {
    ...rest,
    profile_photo_url: profile_photo_path ? `${baseUrl}/files/view/${generatePhotoToken(userId)}` : null,
  };
};

export interface TenantListQuery {
  q?: string;
  status?: TenancyStatus;
  limit?: number;
  offset?: number;
}

// Without `limit`, the full matching list (unchanged shape for older clients).
// With it, a page plus the full match count, like the Payment Ledger.
export const getTenantsByOwner = async (
  ownerId: string,
  baseUrl: string,
  query: TenantListQuery = {}
): Promise<{ data: Record<string, any>[]; total?: number; limit?: number; offset?: number }> => {
  const filters = { q: query.q || undefined, status: query.status };
  if (query.limit === undefined) {
    const rows = await ownerTenantModel.findTenantsByOwner(ownerId, expiringBoundary(), filters);
    return { data: rows.map((r) => withPhotoUrl(r, baseUrl)) };
  }
  const offset = query.offset ?? 0;
  const { rows, total } = await ownerTenantModel.findTenantsPageByOwner(
    ownerId, expiringBoundary(), filters, query.limit, offset
  );
  return { data: rows.map((r) => withPhotoUrl(r, baseUrl)), total, limit: query.limit, offset };
};

export const getTenant = async (ownerId: string, tenantId: string, baseUrl: string): Promise<Record<string, any>> => {
  const tenant = await ownerTenantModel.findTenantByOwner(ownerId, tenantId, expiringBoundary());
  if (!tenant) throw err('No tenant found.', 404);
  return withPhotoUrl(tenant, baseUrl);
};

const PHOTO_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png' };

// Replaces any existing photo. Stored beside the tenant's Documents but not
// as one: no file category, no files row.
export const setPhoto = async (
  ownerId: string,
  tenantId: string,
  file: MulterFile,
  baseUrl: string
): Promise<string> => {
  await assertLinked(ownerId, tenantId);
  const info = await userDetailsModel.findFirstNameAndMobile(tenantId);
  const uploadDir = path.join('uploads', info?.mobile_number || tenantId);
  const newPath = path.join(uploadDir, `profile_photo_${Date.now()}${PHOTO_EXT[file.mimetype]}`);
  const oldPath = await userModel.findProfilePhotoPath(tenantId);

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(newPath, file.buffer);
  try {
    await userModel.setProfilePhotoPath(tenantId, newPath);
  } catch (e) {
    fs.rmSync(newPath, { force: true });
    throw e;
  }
  if (oldPath && oldPath !== newPath) fs.rmSync(oldPath, { force: true });
  return `${baseUrl}/files/view/${generatePhotoToken(tenantId)}`;
};

// Succeeds whether or not there was a photo.
export const removePhoto = async (ownerId: string, tenantId: string): Promise<void> => {
  await assertLinked(ownerId, tenantId);
  const oldPath = await userModel.findProfilePhotoPath(tenantId);
  if (!oldPath) return;
  await userModel.setProfilePhotoPath(tenantId, null);
  fs.rmSync(oldPath, { force: true });
};

export const updateDetails = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<UserDetails> => {
  await assertLinked(ownerId, tenantId);
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: 'country_id' });
  const existing = await userDetailsModel.findByUserId(tenantId);
  if (!existing) throw err('Tenant details not found', 404);
  if (existing.mobile_number !== d.mobile_number) throw err('You are not allowed to update mobile number', 400);
  return userDetailsModel.update(tenantId, d);
};

export const updateAddress = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<Address> => {
  await assertLinked(ownerId, tenantId);
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(tenantId);
  if (!existing) throw err('Address not found', 404);
  return addressModel.update(tenantId, a);
};

export const uploadFile = async (
  ownerId: string,
  tenantId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  await assertLinked(ownerId, tenantId);
  if (!fileCategoryId) throw err('File category ID is required', 400);

  const duplicate = await fileModel.findByUserAndCategory(tenantId, fileCategoryId);
  if (duplicate) throw err('File already exists for this category. Please Update or replace it.', 400);

  return withTransaction(async (client: PoolClient) => {
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM file_categories WHERE id = $1',
      [fileCategoryId]
    );
    const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId, client);

    const categoryName = catRows[0]?.name || 'uncategorized';
    const tenantFirstName = tenantInfo?.first_name || 'tenant';
    const tenantMobile = tenantInfo?.mobile_number || 'unknown';
    const ext = path.extname(file.originalname);
    const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;
    const uploadDir = path.join('uploads', tenantMobile);
    const newPath = path.join(uploadDir, newFilename);

    const record = await fileModel.create({
      user_id: tenantId,
      file_category_id: fileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(newPath, file.buffer);
    return record;
  });
};

export const getFiles = async (ownerId: string, tenantId: string): Promise<Record<string, any>[]> => {
  await assertLinked(ownerId, tenantId);
  return fileModel.findTenantFiles(tenantId);
};

export const getFile = async (ownerId: string, tenantId: string, fileId: string): Promise<FileRecord> => {
  await assertLinked(ownerId, tenantId);
  const file = await fileModel.findTenantFileById(fileId, tenantId);
  if (!file) throw err('File not found', 404);
  return file;
};

export const updateFile = async (
  ownerId: string,
  tenantId: string,
  fileId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  await assertLinked(ownerId, tenantId);

  const existing = await fileModel.findTenantFileByIdWithFilters(fileId, tenantId, { file_category_id: String(fileCategoryId) });
  if (!existing) throw err('Existing file not found', 404);

  return withTransaction(async (client: PoolClient) => {
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM file_categories WHERE id = $1',
      [fileCategoryId]
    );
    const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId, client);

    const categoryName = catRows[0]?.name || 'uncategorized';
    const tenantFirstName = tenantInfo?.first_name || 'tenant';
    const tenantMobile = tenantInfo?.mobile_number || 'unknown';
    const ext = path.extname(file.originalname);
    const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;
    const uploadDir = path.join('uploads', tenantMobile);
    const newPath = path.join(uploadDir, newFilename);

    const updated = await fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    if (fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
    fs.writeFileSync(newPath, file.buffer);
    return updated;
  });
};

export const deleteFile = async (ownerId: string, tenantId: string, fileId: string): Promise<void> => {
  await assertLinked(ownerId, tenantId);
  const existing = await fileModel.findTenantFileById(fileId, tenantId);
  if (!existing) throw err('File not found', 404);

  await withTransaction(async (client: PoolClient) => {
    await fileModel.deleteById(fileId, client);
    if (existing.file_path && fs.existsSync(existing.file_path)) {
      fs.unlinkSync(existing.file_path);
      const parentDir = path.dirname(existing.file_path);
      if (fs.readdirSync(parentDir).length === 0) fs.rmdirSync(parentDir);
    }
  });
};

export const deleteTenant = async (ownerId: string, tenantId: string): Promise<void> => {
  await assertLinked(ownerId, tenantId);
  const row = await userModel.findMobileById(tenantId);
  if (!row) throw err('Tenant not found', 404);
  const details = await userDetailsModel.findByUserId(tenantId);
  await withTransaction(async (client) => {
    // Logged before the delete: the event row has no FK to the tenant, and
    // its context is the only record of who was removed.
    await activityModel.record(
      {
        ownerId,
        type: 'tenant.unlinked',
        subjectKind: 'tenant',
        subjectId: tenantId,
        context: { tenant_name: activityModel.displayName(details?.first_name, details?.last_name) },
      },
      client
    );
    await userModel.deleteById(tenantId, client);
  });
  const tenantDir = `uploads/${row.mobile_number}`;
  if (fs.existsSync(tenantDir)) fs.rmSync(tenantDir, { recursive: true, force: true });
};
