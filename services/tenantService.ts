import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import * as userModel from '../models/user';
import * as userDetailsModel from '../models/userDetails';
import * as addressModel from '../models/address';
import * as ownerTenantModel from '../models/ownerTenant';
import * as fileModel from '../models/file';
import * as ownership from './ownership';
import * as fileStore from './fileStore';
import * as activityModel from '../models/activityEvent';
import { withTransaction } from '../utils/transaction';
import { generateInviteToken } from '../utils/jwtGenerator';
import sendEmail from '../utils/email';
import { today, addDays } from '../utils/businessDate';
import { ENDING_SOON_DAYS } from './dashboardService';
import { TenancyStatus } from '../models/ownerTenant';
import { pickFields, UserDetailsSchema, AddressSchema } from '../schemas/index';
import { User, UserDetails, Address, FileRecord, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

// A bcrypt hash of random bytes: a real hash that no password matches.
const unusablePassword = (): Promise<string> => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

// Emails the set-password link carrying a 7-day Invite token.
const sendInvite = (email: string, token: string): Promise<void> => {
  const link = `${process.env.BASE_URL}/set-password?token=${token}&kind=invite`;
  const html = `<p>Your Property Owner has added you on Proptrove.</p>
  <p>Set your password to sign in:</p>
  <p><a href="${link}">${link}</a></p>
  <p>This link is valid for 7 days.</p>`;
  return sendEmail(email, 'Set your Proptrove password', html);
};

// The Tenant is invited, not given a password: a `password` in the body is ignored.
export const createTenant = async (
  ownerId: string,
  body: Record<string, any>
): Promise<{
  tenant: Omit<User, 'password'>;
  tenantDetails: UserDetails;
  tenantAddress: Address;
  token: string;
}> => {
  const { email, user_type_id } = body;
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: 'country_id' });
  const a = pickFields(body, AddressSchema, { address_country_id: 'country_id' });

  const password = await unusablePassword();
  const created = await withTransaction(async (client: PoolClient) => {
    const existing = await userModel.findByEmail(email);
    if (existing) throw err('User already exists', 400);

    const mobileExists = await userDetailsModel.findByMobileNumber(d.mobile_number, client);
    if (mobileExists) throw err('Mobile Number already exists', 400);

    const tenant = await userModel.createInvited({ email, password, user_type_id }, client);
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

  // After the commit. A failed send leaves the Tenant invite pending; the
  // owner can resend.
  const token = generateInviteToken(email);
  sendInvite(email, token).catch((e) => console.error(`Invite email failed for ${email}:`, e.message));
  return { ...created, token };
};

// Kathmandu date 30 days out: on or before it, an active Agreement is `expiring`.
const expiringBoundary = (): string => addDays(today(), ENDING_SOON_DAYS);

// Swaps the stored path for a signed /files/view URL; the path never leaves the server.
const withPhotoUrl = (row: Record<string, any>, baseUrl: string): Record<string, any> => {
  const { profile_photo_path, ...rest } = row;
  const userId = row.tenant_id ?? row.user_id;
  return {
    ...rest,
    profile_photo_url: fileStore.photoUrl(userId, profile_photo_path, baseUrl),
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

// Replaces any existing photo. Stored beside the tenant's Documents but not
// as one: no file category, no files row.
export const setPhoto = async (
  ownerId: string,
  tenantId: string,
  file: MulterFile,
  baseUrl: string
): Promise<string> => {
  await ownership.tenant(ownerId, tenantId);
  const oldPath = await userModel.findProfilePhotoPath(tenantId);
  const newPath = await fileStore.save(tenantId, [file], async ([placed], client) => {
    await userModel.setProfilePhotoPath(tenantId, placed.file_path, client);
    return placed.file_path;
  });
  fileStore.discard([oldPath]);
  return fileStore.photoUrl(tenantId, newPath, baseUrl)!;
};

// Succeeds whether or not there was a photo.
export const removePhoto = async (ownerId: string, tenantId: string): Promise<void> => {
  await ownership.tenant(ownerId, tenantId);
  const oldPath = await userModel.findProfilePhotoPath(tenantId);
  if (!oldPath) return;
  await userModel.setProfilePhotoPath(tenantId, null);
  fileStore.discard([oldPath]);
};

export const updateDetails = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<UserDetails> => {
  await ownership.tenant(ownerId, tenantId);
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
  await ownership.tenant(ownerId, tenantId);
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(tenantId);
  if (!existing) throw err('Address not found', 404);
  return addressModel.update(tenantId, a);
};

// The label shown for a tenant Document (file_name), not where it's stored.
const displayName = async (
  tenantId: string,
  fileCategoryId: number,
  file: MulterFile,
  client: PoolClient
): Promise<string> => {
  const { rows } = await client.query<{ name: string }>('SELECT name FROM file_categories WHERE id = $1', [fileCategoryId]);
  const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId, client);
  return `${tenantInfo?.first_name || 'tenant'}_${rows[0]?.name || 'uncategorized'}_${Date.now()}${path.extname(file.originalname)}`;
};

export const uploadFile = async (
  ownerId: string,
  tenantId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  await ownership.tenant(ownerId, tenantId);
  if (!fileCategoryId) throw err('File category ID is required', 400);

  const duplicate = await fileModel.findByUserAndCategory(tenantId, fileCategoryId);
  if (duplicate) throw err('File already exists for this category. Please Update or replace it.', 400);

  return fileStore.save(tenantId, [file], async ([placed], client) =>
    fileModel.create({
      user_id: tenantId,
      file_category_id: fileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: await displayName(tenantId, fileCategoryId, file, client),
      file_path: placed.file_path,
    }, client)
  );
};

export const getFiles = async (ownerId: string, tenantId: string): Promise<Record<string, any>[]> => {
  await ownership.tenant(ownerId, tenantId);
  return fileModel.findTenantFiles(tenantId);
};

export const getFile = async (ownerId: string, tenantId: string, fileId: string): Promise<FileRecord> =>
  ownership.document(ownerId, fileId, { tenant: tenantId }) as Promise<FileRecord>;

export const updateFile = async (
  ownerId: string,
  tenantId: string,
  fileId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  const existing = await ownership.document(ownerId, fileId, { tenant: tenantId });
  // A replace keeps the Document's category: naming another one is a miss.
  if (Number(existing.file_category_id) !== Number(fileCategoryId)) throw err('File not found', 404);

  const updated = await fileStore.save(tenantId, [file], async ([placed], client) =>
    fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: await displayName(tenantId, fileCategoryId, file, client),
      file_path: placed.file_path,
    }, client)
  );
  fileStore.discard([existing.file_path]);
  return updated;
};

export const deleteFile = async (ownerId: string, tenantId: string, fileId: string): Promise<void> => {
  const existing = await ownership.document(ownerId, fileId, { tenant: tenantId });
  await fileModel.deleteById(fileId);
  fileStore.discard([existing.file_path]);
};

export const deleteTenant = async (ownerId: string, tenantId: string): Promise<void> => {
  await ownership.tenant(ownerId, tenantId);
  const row = await userModel.findMobileById(tenantId);
  if (!row) throw err('Tenant not found', 404);
  const details = await userDetailsModel.findByUserId(tenantId);
  // The cascade takes the tenant's Documents, photo, Agreements and receipts;
  // their files go once it commits.
  const paths = await withTransaction(async (client) => {
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
    const paths = await fileModel.findPathsCascadingFromUser(tenantId, client);
    await userModel.deleteById(tenantId, client);
    return paths;
  });
  fileStore.discard(paths);
};
