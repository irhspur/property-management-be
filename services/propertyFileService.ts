import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import * as fileModel from '../models/file';
import { withTransaction } from '../utils/transaction';
import { FileRecord, UserData, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

const sanitizeName = (name: string): string => name.replace(/[<>:"/\\|?*]+/g, '_').trim();

export const createFile = async (
  userId: number,
  propertyId: number,
  userData: UserData,
  file: MulterFile,
  propertyFileCategoryId: number
): Promise<FileRecord> => {
  if (!propertyFileCategoryId) throw err('Property file category ID is required', 400);

  const duplicate = await fileModel.findByUserAndPropertyCategory(userId, propertyFileCategoryId, propertyId);
  if (duplicate) throw err('File already exists for this category. Please Update or replace it.', 400);

  return withTransaction(async (client: PoolClient) => {
    const { rows: propRows } = await client.query<{ property_name: string }>(
      'SELECT property_name FROM properties WHERE property_id = $1',
      [propertyId]
    );
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM property_file_categories WHERE id = $1',
      [propertyFileCategoryId]
    );

    const propertyName = propRows[0]?.property_name || 'unknown_property';
    const categoryName = catRows[0]?.name || 'uncategorized';
    const mobileNumber = userData.mobileNumber || 'unknown_user';
    const dir = path.join('uploads', sanitizeName(mobileNumber), sanitizeName(propertyName));
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${sanitizeName(categoryName)}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const record = await fileModel.createPropertyFile({
      user_id: userId,
      property_id: propertyId,
      property_file_category_id: propertyFileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(newPath, file.buffer);
    return record;
  });
};

export const getFiles = async (
  userId: number,
  filters: { property_file_category_id?: string; mobile_number?: string; property_id?: string } = {}
): Promise<Record<string, any>[]> => fileModel.findPropertyFiles(userId, filters);

export const getFileById = async (
  userId: number,
  fileId: number,
  filters: { property_file_category_id?: string } = {}
): Promise<Record<string, any>[]> => fileModel.findPropertyFileById(fileId, userId, filters);

export const updateFile = async (
  userId: number,
  fileId: number,
  userData: UserData,
  file: MulterFile,
  propertyFileCategoryId: number
): Promise<FileRecord> => {
  const existing = await fileModel.findPropertyFileByIdForUpdate(fileId, userId, {
    property_file_category_id: String(propertyFileCategoryId),
  });
  if (!existing) throw err('File not found', 404);

  return withTransaction(async (client: PoolClient) => {
    const { rows: propRows } = await client.query<{ property_name: string }>(
      'SELECT property_name FROM properties WHERE property_id = $1',
      [existing.property_id]
    );
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM property_file_categories WHERE id = $1',
      [propertyFileCategoryId]
    );

    const propertyName = propRows[0]?.property_name || 'unknown_property';
    const categoryName = catRows[0]?.name || 'uncategorized';
    const mobileNumber = userData.mobileNumber || 'unknown_user';
    const dir = path.join('uploads', sanitizeName(mobileNumber), sanitizeName(propertyName));
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${sanitizeName(categoryName)}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const updated = await fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
    fs.writeFileSync(newPath, file.buffer);
    return updated;
  });
};

export const deleteFile = async (
  userId: number,
  fileId: number,
  filters: { mobile_number?: string; property_file_category_id?: string; property_id?: string } = {}
): Promise<void> => {
  const existing = await fileModel.findPropertyFileByIdForUpdate(fileId, userId, filters);
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
