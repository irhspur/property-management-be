import path from 'path';
import { PoolClient } from 'pg';
import * as fileModel from '../models/file';
import * as userDetailsModel from '../models/userDetails';
import * as ownership from './ownership';
import * as fileStore from './fileStore';
import { FileRecord, MulterFile } from '../types';
import { appError } from '../utils/appError';

// The label shown for a Document (file_name), not where it's stored.
const displayName = async (
  userId: string,
  fileCategoryId: number,
  file: MulterFile,
  client: PoolClient
): Promise<string> => {
  const { rows } = await client.query<{ name: string }>('SELECT name FROM file_categories WHERE id = $1', [fileCategoryId]);
  const user = await userDetailsModel.findFirstNameAndMobile(userId, client);
  return `${user?.first_name || 'user'}_${rows[0]?.name || 'uncategorized'}_${Date.now()}${path.extname(file.originalname)}`;
};

export const createFile = async (
  userId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  if (!fileCategoryId) throw appError('File category ID is required', 400);

  const duplicate = await fileModel.findByUserAndCategory(userId, fileCategoryId);
  if (duplicate) throw appError('File already exists for this category. Please Update or replace it.', 400);

  return fileStore.save(userId, [file], async ([placed], client) => {
    const fileName = await displayName(userId, fileCategoryId, file, client);
    return fileModel.create({
      user_id: userId,
      file_category_id: fileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: fileName,
      file_path: placed.file_path,
    }, client);
  });
};

export const getFiles = async (
  userId: string,
  filters: { file_category_id?: string; mobile_number?: string } = {}
): Promise<Record<string, any>[]> => fileModel.findByUserWithCategory(userId, filters);

export const getFile = async (userId: string, fileId: string): Promise<FileRecord> =>
  ownership.document(userId, fileId, { self: true }) as Promise<FileRecord>;

export const updateFile = async (
  userId: string,
  fileId: string,
  file: MulterFile,
  fileCategoryId: number
): Promise<FileRecord> => {
  const existing = await ownership.document(userId, fileId, { self: true });
  // A replace keeps the Document's category: naming another one is a miss.
  if (Number(existing.file_category_id) !== Number(fileCategoryId)) throw appError('File not found', 404);

  const updated = await fileStore.save(userId, [file], async ([placed], client) =>
    fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: await displayName(userId, fileCategoryId, file, client),
      file_path: placed.file_path,
    }, client)
  );
  fileStore.discard([existing.file_path]);
  return updated;
};

export const deleteFile = async (userId: string, fileId: string): Promise<void> => {
  const existing = await ownership.document(userId, fileId, { self: true });
  await fileModel.deleteById(fileId);
  fileStore.discard([existing.file_path]);
};
