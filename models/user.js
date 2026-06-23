const pool = require("../config/database");

const findByEmail = async (email) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] || null;
};

const findById = async (id) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE user_id = $1", [id]);
  return rows[0] || null;
};

const findSummaryById = async (id) => {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.email, ud.first_name, ud.last_name, ud.middle_name,
      ud.dob, ud.father_full_name, ud.nin_number, ud.mobile_number,
      ud.citizenship_number, ud.citizenship_issue_date,
      ud.bank_account_number, ud.bank_name,
      u.is_verified, u.is_active, u.password_last_changed, u.created_at, u.updated_at
    FROM users u LEFT JOIN user_details ud ON u.user_id = ud.user_id
    WHERE u.user_id = $1`,
    [id]
  );
  return rows[0] || null;
};

const findProfileById = async (id) => {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.email, u.is_verified, u.is_active, u.password_last_changed, u.created_at, u.updated_at,
      ud.first_name, ud.middle_name, ud.last_name, ud.dob, ud.father_full_name, ud.nin_number,
      ud.mobile_number, ud.citizenship_number, ud.citizenship_issue_date,
      ud.citizenship_issue_district_id, ud.bank_account_number, ud.bank_name,
      ud.gender_id, g.name AS gender,
      ud.country_id AS birth_country_id, c.nicename AS birth_country,
      ud.birth_province_id, p.name AS birth_province,
      ud.birth_district_id, d.name AS birth_district
    FROM users u
    LEFT JOIN user_details ud ON u.user_id = ud.user_id
    LEFT JOIN gender g ON ud.gender_id = g.id
    LEFT JOIN country c ON ud.country_id = c.id
    LEFT JOIN province p ON ud.birth_province_id = p.id
    LEFT JOIN district d ON ud.birth_district_id = d.id
    WHERE u.user_id = $1`,
    [id]
  );
  return rows[0] || null;
};

const findMobileById = async (id) => {
  const { rows } = await pool.query(
    `SELECT u.user_id, ud.mobile_number
    FROM users u JOIN user_details ud ON u.user_id = ud.user_id
    WHERE u.user_id = $1`,
    [id]
  );
  return rows[0] || null;
};

const create = async ({ email, password, user_type_id }, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO users (email, password, user_type_id, password_last_changed)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *`,
    [email, password, user_type_id]
  );
  return rows[0];
};

const setVerified = async (email) => {
  const result = await pool.query(
    `UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE email = $1 RETURNING *`,
    [email]
  );
  return result.rowCount;
};

const updatePasswordByEmail = async (email, hashedPassword) => {
  const { rows } = await pool.query(
    `UPDATE users SET password = $1, password_last_changed = CURRENT_TIMESTAMP, updated_at = NOW()
    WHERE email = $2 RETURNING *`,
    [hashedPassword, email]
  );
  return rows[0] || null;
};

const updatePasswordById = async (id, hashedPassword) => {
  await pool.query(
    `UPDATE users SET password = $1, password_last_changed = CURRENT_TIMESTAMP, updated_at = NOW()
    WHERE user_id = $2`,
    [hashedPassword, id]
  );
};

const deleteById = async (id, client = pool) => {
  await client.query("DELETE FROM users WHERE user_id = $1", [id]);
};

module.exports = {
  findByEmail,
  findById,
  findSummaryById,
  findProfileById,
  findMobileById,
  create,
  setVerified,
  updatePasswordByEmail,
  updatePasswordById,
  deleteById,
};
