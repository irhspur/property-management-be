const pool = require("../config/database");

const findByUserId = async (userId, client = pool) => {
  const { rows } = await client.query(
    "SELECT * FROM user_details WHERE user_id = $1",
    [userId]
  );
  return rows[0] || null;
};

const findByMobileNumber = async (mobile, client = pool) => {
  const { rows } = await client.query(
    "SELECT * FROM user_details WHERE mobile_number = $1",
    [mobile]
  );
  return rows[0] || null;
};

const findFirstNameAndMobile = async (userId, client = pool) => {
  const { rows } = await client.query(
    "SELECT first_name, mobile_number FROM user_details WHERE user_id = $1",
    [userId]
  );
  return rows[0] || null;
};

const insert = async (userId, d, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO user_details (
      user_id, first_name, middle_name, last_name, gender_id, dob,
      country_id, birth_province_id, birth_district_id, father_full_name,
      nin_number, mobile_number, citizenship_number,
      citizenship_issue_district_id, citizenship_issue_date,
      bank_account_number, bank_name
    ) VALUES (
      $1, INITCAP($2), INITCAP($3), INITCAP($4), $5, $6,
      $7, $8, $9, INITCAP($10), $11, $12, $13, $14, $15, $16, INITCAP($17)
    ) RETURNING *`,
    [
      userId,
      d.first_name, d.middle_name, d.last_name, d.gender_id, d.dob,
      d.country_id, d.birth_province_id, d.birth_district_id, d.father_full_name,
      d.nin_number, d.mobile_number, d.citizenship_number,
      d.citizenship_issue_district_id, d.citizenship_issue_date,
      d.bank_account_number, d.bank_name,
    ]
  );
  return rows[0];
};

const update = async (userId, d, client = pool) => {
  const { rows } = await client.query(
    `UPDATE user_details SET
      first_name = INITCAP($1), middle_name = INITCAP($2), last_name = INITCAP($3),
      gender_id = $4, dob = $5, country_id = $6, birth_province_id = $7,
      birth_district_id = $8, father_full_name = INITCAP($9), nin_number = $10,
      mobile_number = $11, citizenship_number = $12,
      citizenship_issue_district_id = $13, citizenship_issue_date = $14,
      bank_account_number = $15, bank_name = INITCAP($16), updated_at = NOW()
    WHERE user_id = $17 RETURNING *`,
    [
      d.first_name, d.middle_name, d.last_name, d.gender_id, d.dob,
      d.country_id, d.birth_province_id, d.birth_district_id, d.father_full_name,
      d.nin_number, d.mobile_number, d.citizenship_number,
      d.citizenship_issue_district_id, d.citizenship_issue_date,
      d.bank_account_number, d.bank_name, userId,
    ]
  );
  return rows[0];
};

const upsert = async (userId, d, client = pool) => {
  const existing = await findByUserId(userId, client);
  if (existing) return update(userId, d, client);
  return insert(userId, d, client);
};

module.exports = { findByUserId, findByMobileNumber, findFirstNameAndMobile, insert, update, upsert };
