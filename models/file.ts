import pool from '../config/database';
import { DbClient, FileRecord, FileFields, UpdateFileFields } from '../types';

export const findByUserAndCategory = async (
  userId: string,
  fileCategoryId: number,
  client: DbClient = pool
): Promise<FileRecord | null> => {
  const { rows } = await client.query<FileRecord>(
    'SELECT * FROM files WHERE user_id = $1 AND file_category_id = $2',
    [userId, fileCategoryId]
  );
  return rows[0] || null;
};

export const findByUserAndPropertyCategory = async (
  userId: string,
  propertyFileCategoryId: number,
  propertyId: string,
  client: DbClient = pool
): Promise<boolean> => {
  const { rows } = await client.query(
    'SELECT 1 FROM files WHERE user_id = $1 AND property_file_category_id = $2 AND property_id = $3',
    [userId, propertyFileCategoryId, propertyId]
  );
  return rows.length > 0;
};

export const findById = async (fileId: string): Promise<FileRecord | null> => {
  const { rows } = await pool.query<FileRecord>('SELECT * FROM files WHERE file_id = $1', [fileId]);
  return rows[0] || null;
};

export const findByUserWithCategory = async (
  userId: string,
  filters: { file_category_id?: string; mobile_number?: string } = {}
): Promise<Record<string, any>[]> => {
  let query = `SELECT f.*, fc.name AS file_category_name
    FROM files f
    JOIN file_categories fc ON f.file_category_id = fc.id
    WHERE f.user_id = $1`;
  const params: any[] = [userId];
  let i = 2;
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  if (filters.mobile_number) {
    query += ` AND EXISTS (SELECT 1 FROM user_details ud WHERE ud.user_id = f.user_id AND ud.mobile_number = $${i++})`;
    params.push(filters.mobile_number);
  }
  query += ' ORDER BY f.upload_date DESC';
  const { rows } = await pool.query(query, params);
  return rows;
};

export const findByIdWithOwnerCheck = async (
  fileId: string,
  userId: string,
  filters: { file_category_id?: string; mobile_number?: string } = {}
): Promise<FileRecord | null> => {
  let query = `SELECT f.* FROM files f
    JOIN user_details ud ON f.user_id = ud.user_id
    WHERE f.file_id = $1`;
  const params: any[] = [fileId];
  let i = 2;
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  query += ` AND f.user_id = $${i}`;
  params.push(userId);
  const { rows } = await pool.query<FileRecord>(query, params);
  return rows[0] || null;
};

export const findTenantFiles = async (tenantId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `SELECT f.*, fc.name AS file_category_name
    FROM files f
    JOIN file_categories fc ON f.file_category_id = fc.id
    WHERE f.user_id = $1
    ORDER BY f.upload_date DESC`,
    [tenantId]
  );
  return rows;
};

export const findTenantFileById = async (fileId: string, tenantId: string): Promise<FileRecord | null> => {
  const { rows } = await pool.query<FileRecord>(
    'SELECT * FROM files WHERE file_id = $1 AND user_id = $2',
    [fileId, tenantId]
  );
  return rows[0] || null;
};

export const findTenantFileByIdWithFilters = async (
  fileId: string,
  tenantId: string,
  filters: { file_category_id?: string } = {}
): Promise<FileRecord | null> => {
  let query = `SELECT f.* FROM files f
    JOIN user_details ud ON f.user_id = ud.user_id
    WHERE f.file_id = $1`;
  const params: any[] = [fileId];
  let i = 2;
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  query += ` AND f.user_id = $${i}`;
  params.push(tenantId);
  const { rows } = await pool.query<FileRecord>(query, params);
  return rows[0] || null;
};

export const findPropertyFiles = async (
  userId: string,
  filters: { property_file_category_id?: string; mobile_number?: string; property_id?: string } = {}
): Promise<Record<string, any>[]> => {
  let query = `SELECT f.*, pfc.name AS property_file_category_name
    FROM files f
    JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
    WHERE f.user_id = $1`;
  const params: any[] = [userId];
  let i = 2;
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i++}`; params.push(filters.property_file_category_id); }
  if (filters.mobile_number) {
    query += ` AND EXISTS (SELECT 1 FROM user_details ud WHERE ud.user_id = f.user_id AND ud.mobile_number = $${i++})`;
    params.push(filters.mobile_number);
  }
  if (filters.property_id) { query += ` AND f.property_id = $${i++}`; params.push(filters.property_id); }
  query += ' ORDER BY f.upload_date DESC';
  const { rows } = await pool.query(query, params);
  return rows;
};

export const findPropertyFileById = async (
  fileId: string,
  userId: string,
  filters: { property_file_category_id?: string } = {}
): Promise<Record<string, any>[]> => {
  let query = `SELECT f.*, pfc.name AS property_file_category_name
    FROM files f
    JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
    WHERE f.file_id = $1 AND f.user_id = $2`;
  const params: any[] = [fileId, userId];
  let i = 3;
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i}`; params.push(filters.property_file_category_id); }
  const { rows } = await pool.query(query, params);
  return rows;
};

export const findPropertyFileByIdForUpdate = async (
  fileId: string,
  userId: string,
  filters: { property_file_category_id?: string; property_id?: string; mobile_number?: string } = {}
): Promise<FileRecord | null> => {
  let query = `SELECT f.* FROM files f JOIN user_details ud ON f.user_id = ud.user_id WHERE f.file_id = $1`;
  const params: any[] = [fileId];
  let i = 2;
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i++}`; params.push(filters.property_file_category_id); }
  query += ` AND f.user_id = $${i++}`; params.push(userId);
  if (filters.property_id) { query += ` AND f.property_id = $${i}`; params.push(filters.property_id); }
  const { rows } = await pool.query<FileRecord>(query, params);
  return rows[0] || null;
};

export const create = async (fields: FileFields, client: DbClient = pool): Promise<FileRecord> => {
  const { rows } = await client.query<FileRecord>(
    `INSERT INTO files (user_id, file_category_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [fields.user_id, fields.file_category_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

export const createPropertyFile = async (fields: FileFields, client: DbClient = pool): Promise<FileRecord> => {
  const { rows } = await client.query<FileRecord>(
    `INSERT INTO files (user_id, property_id, property_file_category_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [fields.user_id, fields.property_id, fields.property_file_category_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

const AGREEMENT_FILE_SELECT = `SELECT f.*, afc.name AS file_category_name, afc.code AS file_category_code
  FROM files f
  JOIN agreement_file_categories afc ON f.agreement_file_category_id = afc.id`;

export const findAgreementFiles = async (agreementId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `${AGREEMENT_FILE_SELECT} WHERE f.agreement_id = $1 ORDER BY f.upload_date DESC`,
    [agreementId]
  );
  return rows;
};

export const findAgreementFileById = async (
  fileId: string,
  agreementId: string
): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(
    `${AGREEMENT_FILE_SELECT} WHERE f.file_id = $1 AND f.agreement_id = $2`,
    [fileId, agreementId]
  );
  return rows[0] || null;
};

export const createAgreementFile = async (fields: FileFields, client: DbClient = pool): Promise<FileRecord> => {
  const { rows } = await client.query<FileRecord>(
    `INSERT INTO files (user_id, agreement_id, agreement_file_category_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [fields.user_id, fields.agreement_id, fields.agreement_file_category_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

// Payment receipts: no category, so a plain column list rather than a join.
const RECEIPT_SELECT = `SELECT file_id, user_id, payment_id, file_name, original_name, mimetype, file_size,
  file_path, upload_date, created_at, updated_at
  FROM files`;

export const findPaymentReceipts = async (paymentId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `${RECEIPT_SELECT} WHERE payment_id = $1 ORDER BY upload_date DESC, created_at DESC`,
    [paymentId]
  );
  return rows;
};

export const findPaymentReceiptById = async (
  fileId: string,
  paymentId: string
): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(`${RECEIPT_SELECT} WHERE file_id = $1 AND payment_id = $2`, [fileId, paymentId]);
  return rows[0] || null;
};

export const createPaymentReceipt = async (
  fields: FileFields,
  client: DbClient = pool
): Promise<Record<string, any>> => {
  const { rows } = await client.query(
    `INSERT INTO files (user_id, payment_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING file_id, user_id, payment_id, file_name, original_name, mimetype, file_size,
      file_path, upload_date, created_at, updated_at`,
    [fields.user_id, fields.payment_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

// Deletes a Payment's receipt rows and returns their paths, so the caller can
// remove the stored files once its transaction commits.
export const deleteByPayment = async (paymentId: string, client: DbClient = pool): Promise<string[]> => {
  const { rows } = await client.query<{ file_path: string }>(
    'DELETE FROM files WHERE payment_id = $1 RETURNING file_path',
    [paymentId]
  );
  return rows.map((r) => r.file_path);
};

export const update = async (fileId: string, fields: UpdateFileFields, client: DbClient = pool): Promise<FileRecord> => {
  const { rows } = await client.query<FileRecord>(
    `UPDATE files SET
      original_name = $1, mimetype = $2, file_size = $3,
      file_name = $4, file_path = $5, upload_date = NOW(), updated_at = NOW()
    WHERE file_id = $6 RETURNING *`,
    [fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path, fileId]
  );
  return rows[0];
};

export const deleteById = async (fileId: string, client: DbClient = pool): Promise<void> => {
  await client.query('DELETE FROM files WHERE file_id = $1', [fileId]);
};
