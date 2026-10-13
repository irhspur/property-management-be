import path from 'path';
import { PoolClient } from 'pg';
import * as fileModel from '../models/file';
import * as userDetailsModel from '../models/userDetails';
import * as ownership from './ownership';
import * as fileStore from './fileStore';
import { FileRecord, MulterFile } from '../types';
import { appError } from '../utils/appError';

const sanitizeName = (name: string): string => name.replace(/[<>:"/\\|?*]+/g, '_').trim();

// The label shown for a Document (file_name), not where it's stored.
const displayName = async (
  userId: string,
  propertyFileCategoryId: number,
  file: MulterFile,
  client: PoolClient
): Promise<string> => {
  const { rows } = await client.query<{ name: string }>(
    'SELECT name FROM property_file_categories WHERE id = $1',
    [propertyFileCategoryId]
  );
  const user = await userDetailsModel.findFirstNameAndMobile(userId, client);
  return `${user?.first_name || 'user'}_${sanitizeName(rows[0]?.name || 'uncategorized')}_${Date.now()}${path.extname(file.originalname)}`;
};

export const createFile = async (
  userId: string,
  propertyId: string,
  file: MulterFile,
  propertyFileCategoryId: number
): Promise<FileRecord> => {
  await ownership.property(userId, propertyId);
  if (!propertyFileCategoryId) throw appError('Property file category ID is required', 400);

  const duplicate = await fileModel.findByUserAndPropertyCategory(userId, propertyFileCategoryId, propertyId);
  if (duplicate) throw appError('File already exists for this category. Please Update or replace it.', 400);

  return fileStore.save(userId, [file], async ([placed], client) =>
    fileModel.createPropertyFile({
      user_id: userId,
      property_id: propertyId,
      property_file_category_id: propertyFileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: await displayName(userId, propertyFileCategoryId, file, client),
      file_path: placed.file_path,
    }, client)
  );
};

export const getFiles = async (
  userId: string,
  filters: { property_file_category_id?: string; mobile_number?: string; property_id?: string } = {}
): Promise<Record<string, any>[]> => fileModel.findPropertyFiles(userId, filters);

export const getFileById = async (userId: string, fileId: string): Promise<Record<string, any>> =>
  ownership.document(userId, fileId, { property: null });

export const updateFile = async (
  userId: string,
  fileId: string,
  file: MulterFile,
  propertyFileCategoryId: number
): Promise<FileRecord> => {
  const existing = await ownership.document(userId, fileId, { property: null });
  // A replace keeps the Document's category: naming another one is a miss.
  if (Number(existing.property_file_category_id) !== Number(propertyFileCategoryId)) {
    throw appError('File not found', 404);
  }

  const updated = await fileStore.save(userId, [file], async ([placed], client) =>
    fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: await displayName(userId, propertyFileCategoryId, file, client),
      file_path: placed.file_path,
    }, client)
  );
  fileStore.discard([existing.file_path]);
  return updated;
};

export const deleteFile = async (userId: string, fileId: string): Promise<void> => {
  const existing = await ownership.document(userId, fileId, { property: null });
  await fileModel.deleteById(fileId);
  fileStore.discard([existing.file_path]);
};
