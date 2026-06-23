const pool = require("../config/database");

const findByUserAndCategory = async (userId, fileCategoryId, client = pool) => {
  const { rows } = await client.query(
    "SELECT * FROM files WHERE user_id = $1 AND file_category_id = $2",
    [userId, fileCategoryId]
  );
  return rows[0] || null;
};

const findByUserAndPropertyCategory = async (userId, propertyFileCategoryId, propertyId, client = pool) => {
  const { rows } = await client.query(
    "SELECT 1 FROM files WHERE user_id = $1 AND property_file_category_id = $2 AND property_id = $3",
    [userId, propertyFileCategoryId, propertyId]
  );
  return rows.length > 0;
};

const findById = async (fileId) => {
  const { rows } = await pool.query("SELECT * FROM files WHERE file_id = $1", [fileId]);
  return rows[0] || null;
};

const findByUserWithCategory = async (userId, filters = {}) => {
  let query = `SELECT f.*, fc.name AS file_category_name
    FROM files f
    JOIN file_categories fc ON f.file_category_id = fc.id
    JOIN user_details ud ON f.user_id = ud.user_id
    WHERE f.user_id = $1`;
  const params = [userId];
  let i = 2;
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  query += " ORDER BY f.upload_date DESC";
  const { rows } = await pool.query(query, params);
  return rows;
};

const findByIdWithOwnerCheck = async (fileId, userId, filters = {}) => {
  let query = `SELECT f.* FROM files f
    JOIN user_details ud ON f.user_id = ud.user_id
    WHERE f.file_id = $1`;
  const params = [fileId];
  let i = 2;
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  query += ` AND f.user_id = $${i}`;
  params.push(userId);
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
};

const findTenantFiles = async (tenantId) => {
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

const findTenantFileById = async (fileId, tenantId) => {
  const { rows } = await pool.query(
    "SELECT * FROM files WHERE file_id = $1 AND user_id = $2",
    [fileId, tenantId]
  );
  return rows[0] || null;
};

const findTenantFileByIdWithFilters = async (fileId, tenantId, filters = {}) => {
  let query = `SELECT f.* FROM files f
    JOIN user_details ud ON f.user_id = ud.user_id
    WHERE f.file_id = $1`;
  const params = [fileId];
  let i = 2;
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.file_category_id) { query += ` AND f.file_category_id = $${i++}`; params.push(filters.file_category_id); }
  query += ` AND f.user_id = $${i}`;
  params.push(tenantId);
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
};

const findPropertyFiles = async (userId, filters = {}) => {
  let query = `SELECT f.*, pfc.name AS property_file_category_name
    FROM files f
    JOIN user_details ud ON f.user_id = ud.user_id
    JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
    WHERE f.user_id = $1`;
  const params = [userId];
  let i = 2;
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i++}`; params.push(filters.property_file_category_id); }
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.property_id) { query += ` AND f.property_id = $${i++}`; params.push(filters.property_id); }
  query += " ORDER BY f.upload_date DESC";
  const { rows } = await pool.query(query, params);
  return rows;
};

const findPropertyFileById = async (fileId, userId, filters = {}) => {
  let query = `SELECT f.*, pfc.name AS property_file_category_name
    FROM files f
    JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
    WHERE f.file_id = $1`;
  const params = [fileId];
  let i = 2;
  query += ` AND f.user_id = $${i++}`;
  params.push(userId);
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i++}`; params.push(filters.property_file_category_id); }
  const { rows } = await pool.query(query, params);
  return rows;
};

const findPropertyFileByIdForUpdate = async (fileId, userId, filters = {}) => {
  let query = `SELECT f.* FROM files f JOIN user_details ud ON f.user_id = ud.user_id WHERE f.file_id = $1`;
  const params = [fileId];
  let i = 2;
  if (filters.mobile_number) { query += ` AND ud.mobile_number = $${i++}`; params.push(filters.mobile_number); }
  if (filters.property_file_category_id) { query += ` AND f.property_file_category_id = $${i++}`; params.push(filters.property_file_category_id); }
  query += ` AND f.user_id = $${i++}`;
  params.push(userId);
  if (filters.property_id) { query += ` AND f.property_id = $${i}`; params.push(filters.property_id); }
  const { rows } = await pool.query(query, params);
  return rows[0] || null;
};

const create = async (fields, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO files (user_id, file_category_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [fields.user_id, fields.file_category_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

const createPropertyFile = async (fields, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO files (user_id, property_id, property_file_category_id, original_name, mimetype, file_size, file_name, file_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [fields.user_id, fields.property_id, fields.property_file_category_id, fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path]
  );
  return rows[0];
};

const update = async (fileId, fields, client = pool) => {
  const { rows } = await client.query(
    `UPDATE files SET
      original_name = $1, mimetype = $2, file_size = $3,
      file_name = $4, file_path = $5, upload_date = NOW(), updated_at = NOW()
    WHERE file_id = $6 RETURNING *`,
    [fields.original_name, fields.mimetype, fields.file_size, fields.file_name, fields.file_path, fileId]
  );
  return rows[0];
};

const deleteById = async (fileId, client = pool) => {
  await client.query("DELETE FROM files WHERE file_id = $1", [fileId]);
};

module.exports = {
  findByUserAndCategory,
  findByUserAndPropertyCategory,
  findById,
  findByUserWithCategory,
  findByIdWithOwnerCheck,
  findTenantFiles,
  findTenantFileById,
  findTenantFileByIdWithFilters,
  findPropertyFiles,
  findPropertyFileById,
  findPropertyFileByIdForUpdate,
  create,
  createPropertyFile,
  update,
  deleteById,
};
