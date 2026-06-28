import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import * as userModel from '../models/user';
import * as userDetailsModel from '../models/userDetails';
import * as addressModel from '../models/address';
import * as ownerTenantModel from '../models/ownerTenant';
import * as fileModel from '../models/file';
import { withTransaction } from '../utils/transaction';
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
): Promise<{ tenant: User; tenantDetails: UserDetails; tenantAddress: Address }> => {
  const { email, password, user_type_id } = body;
  const d = pickFields(body, UserDetailsSchema);
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

    return { tenant, tenantDetails: details, tenantAddress: address };
  });
};

export const getTenantsByOwner = async (ownerId: string): Promise<Record<string, any>[]> =>
  ownerTenantModel.findTenantsByOwner(ownerId);

export const getTenant = async (ownerId: string, tenantId: string): Promise<Record<string, any>> => {
  const tenant = await ownerTenantModel.findTenantByOwner(ownerId, tenantId);
  if (!tenant) throw err('No tenant found.', 404);
  return tenant;
};

export const updateDetails = async (
  ownerId: string,
  tenantId: string,
  body: Record<string, any>
): Promise<UserDetails> => {
  await assertLinked(ownerId, tenantId);
  const d = pickFields(body, UserDetailsSchema);
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
  await userModel.deleteById(tenantId);
  const tenantDir = `uploads/${row.mobile_number}`;
  if (fs.existsSync(tenantDir)) fs.rmSync(tenantDir, { recursive: true, force: true });
};
