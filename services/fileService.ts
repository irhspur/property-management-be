import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import * as fileModel from '../models/file';
import { withTransaction } from '../utils/transaction';
import { FileRecord, UserData, MulterFile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const createFile = async (
  userId: string,
  userData: UserData,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  if (!fileCategoryId) throw err('File category ID is required', 400);

  const duplicate = await fileModel.findByUserAndCategory(userId, fileCategoryId);
  if (duplicate) throw err('File already exists for this category. Please Update or replace it.', 400);

  return withTransaction(async (client: PoolClient) => {
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM file_categories WHERE id = $1',
      [fileCategoryId]
    );
    const categoryName = catRows[0]?.name || 'uncategorized';
    const mobileNumber = userData.mobileNumber || 'unknown_user';
    const dir = path.join('uploads', mobileNumber);
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${categoryName}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const record = await fileModel.create({
      user_id: userId,
      file_category_id: fileCategoryId,
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
  userId: string,
  filters: { file_category_id?: string; mobile_number?: string } = {}
): Promise<Record<string, any>[]> => fileModel.findByUserWithCategory(userId, filters);

export const getFile = async (userId: string, fileId: string): Promise<FileRecord> => {
  const file = await fileModel.findByIdWithOwnerCheck(fileId, userId);
  if (!file) throw err('File not found', 404);
  return file;
};

export const updateFile = async (
  userId: string,
  userData: UserData,
  fileId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  const existing = await fileModel.findByIdWithOwnerCheck(fileId, userId, { file_category_id: String(fileCategoryId) });
  if (!existing) throw err('File not found', 404);

  return withTransaction(async (client: PoolClient) => {
    const { rows: catRows } = await client.query<{ name: string }>(
      'SELECT name FROM file_categories WHERE id = $1',
      [fileCategoryId]
    );
    const categoryName = catRows[0]?.name || 'uncategorized';
    const mobileNumber = userData.mobileNumber || 'unknown_user';
    const dir = path.join('uploads', mobileNumber);
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${categoryName}_${Date.now()}${ext}`;
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
  userId: string,
  fileId: string,
  filters: { mobile_number?: string; file_category_id?: string } = {}
): Promise<void> => {
  const existing = await fileModel.findByIdWithOwnerCheck(fileId, userId, filters);
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
