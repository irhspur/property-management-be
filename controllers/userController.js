const pool = require("../config/database");
const fs = require("fs");

const createUser = async (req, res) => {
  try {
    await pool.query("BEGIN");
    const userId = req.user.id;
    const {
      first_name,
      middle_name,
      last_name,
      gender_id,
      dob,
      birth_country_id,
      birth_province_id,
      birth_district_id,
      father_full_name,
      nin_number,
      mobile_number,
      citizenship_number,
      citizenship_issue_district_id,
      citizenship_issue_date,
      bank_account_number,
      bank_name,
      address_country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number_1,
      contact_number_2,
      contact_address,
    } = req.body;

    const existingDetails = await pool.query(
      "SELECT user_details_id FROM user_details WHERE user_id = $1",
      [userId]
    );

    let savedDetails;
    if (existingDetails.rows.length > 0) {
      savedDetails = await pool.query(
        `UPDATE user_details SET
          first_name = INITCAP($1),
          middle_name = INITCAP($2),
          last_name = INITCAP($3),
          gender_id = $4,
          dob = $5,
          country_id = $6,
          birth_province_id = $7,
          birth_district_id = $8,
          father_full_name = INITCAP($9),
          nin_number = $10,
          mobile_number = $11,
          citizenship_number = $12,
          citizenship_issue_district_id = $13,
          citizenship_issue_date = $14,
          bank_account_number = $15,
          bank_name = INITCAP($16),
          updated_at = NOW()
        WHERE user_id = $17 RETURNING *`,
        [
          first_name, middle_name, last_name, gender_id, dob,
          birth_country_id, birth_province_id, birth_district_id, father_full_name,
          nin_number, mobile_number, citizenship_number,
          citizenship_issue_district_id, citizenship_issue_date,
          bank_account_number, bank_name, userId,
        ]
      );
    } else {
      savedDetails = await pool.query(
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
          userId, first_name, middle_name, last_name, gender_id, dob,
          birth_country_id, birth_province_id, birth_district_id, father_full_name,
          nin_number, mobile_number, citizenship_number,
          citizenship_issue_district_id, citizenship_issue_date,
          bank_account_number, bank_name,
        ]
      );
    }

    const existingAddress = await pool.query(
      "SELECT address_id FROM address WHERE user_id = $1",
      [userId]
    );

    let savedAddress;
    if (existingAddress.rows.length > 0) {
      savedAddress = await pool.query(
        `UPDATE address SET
          country_id = $1, province_id = $2, district_id = $3,
          municipality_id = $4, ward_number = $5, street_name = INITCAP($6),
          house_number = INITCAP($7), contact_number_1 = $8,
          contact_number_2 = $9, contact_address = INITCAP($10),
          updated_at = NOW()
        WHERE user_id = $11 RETURNING *`,
        [
          address_country_id, province_id, district_id, municipality_id,
          ward_number, street_name, house_number, contact_number_1,
          contact_number_2, contact_address, userId,
        ]
      );
    } else {
      savedAddress = await pool.query(
        `INSERT INTO address (
          user_id, country_id, province_id, district_id, municipality_id,
          ward_number, street_name, house_number, contact_number_1,
          contact_number_2, contact_address
        ) VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), INITCAP($8), $9, $10, INITCAP($11)) RETURNING *`,
        [
          userId, address_country_id, province_id, district_id, municipality_id,
          ward_number, street_name, house_number, contact_number_1,
          contact_number_2, contact_address,
        ]
      );
    }

    await pool.query("COMMIT");
    res.json({
      status: "AK",
      data: {
        userDetails: savedDetails.rows[0],
        address: savedAddress.rows[0],
      },
      message: "User profile saved successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error.message);
    res.json({ status: "NAK", message: "Error saving user profile" });
  }
};

const getUserByUserId = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(userId)
    const user = await pool.query(
      `
      SELECT 
        u.user_id AS user_id,
        u.email,
        ud.first_name,
        ud.last_name,
        ud.middle_name,
        ud.dob,
        ud.father_full_name,
        ud.nin_number,
        ud.mobile_number,
        ud.citizenship_number,
        ud.citizenship_issue_date,
        ud.bank_account_number,
        ud.bank_name,
        u.is_verified,
        u.is_active,
        u.password_last_changed,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN user_details ud ON u.user_id = ud.user_id
      WHERE u.user_id = $1
      `,
      [userId]
    );
    console.log(user)
    if (user.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No user found.",
      });
    }
    res.json({ status: "AK", data: user.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user" });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const id = req.user.id;
    const {
      first_name,
      middle_name,
      last_name,
      gender_id,
      dob,
      country_id,
      birth_province_id,
      birth_district_id,
      father_full_name,
      nin_number,
      citizenship_number,
      citizenship_issue_district_id,
      citizenship_issue_date,
      bank_account_number,
      bank_name,
    } = req.body;
    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE user_id = $1",
      [id]
    );
    if (userDetails.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User details not found" });
    }
    const existing = userDetails.rows[0];
    if (existing.mobile_number !== req.body.mobile_number) {
      return res.status(400).json({
        status: "NAK",
        message: "You are not allowed to update mobile number",
      });
    }
    const updateUserDetails = await pool.query(
      `
            UPDATE user_details 
            SET 
            first_name = INITCAP($1), 
            middle_name = INITCAP($2),
            last_name =  INITCAP($3),
            gender_id = $4,
            dob = $5,
            country_id = $6,
            birth_province_id = $7,
            birth_district_id = $8,
            father_full_name = INITCAP($9),
            nin_number = $10,
            mobile_number = $11,
            citizenship_number = $12,
            citizenship_issue_district_id = $13,
            citizenship_issue_date = $14,
            bank_account_number = $15,
            bank_name = INITCAP($16),
            updated_at = NOW()
            WHERE user_id = $17 RETURNING *
            `,
      [
        first_name,
        middle_name,
        last_name,
        gender_id,
        dob,
        country_id,
        birth_province_id,
        birth_district_id,
        father_full_name,
        nin_number,
        existing.mobile_number,
        citizenship_number,
        citizenship_issue_district_id,
        citizenship_issue_date,
        bank_account_number,
        bank_name,
        id,
      ]
    );
    res.json({ status: "AK", data: updateUserDetails.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating user details" });
  }
};
const updateAddress = async (req, res) => {
  try {
    const user_id = req.user.id;
    const {
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number_1,
      contact_number_2,
      contact_address,
    } = req.body;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1",
      [user_id]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found" });
    }
    const updatedAddress = await pool.query(
      `
              UPDATE address 
              SET 
                  country_id = $1, 
                  province_id = $2, 
                  district_id = $3, 
                  municipality_id = $4, 
                  ward_number = $5, 
                  street_name = INITCAP($6), 
                  house_number = INITCAP($7), 
                  contact_number_1 = $8, 
                  contact_number_2 = $9, 
                  contact_address = INITCAP($10),
                  updated_at = NOW()
              WHERE user_id = $11 RETURNING *
              `,
      [
        country_id,
        province_id,
        district_id,
        municipality_id,
        ward_number,
        street_name,
        house_number,
        contact_number_1,
        contact_number_2,
        contact_address,
        user_id,
      ]
    );
    res.json({
      status: "AK",
      data: updatedAddress.rows[0],
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating address" });
  }
};
const deleteUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await pool.query(
      `SELECT u.user_id, ud.mobile_number
         FROM users u
         JOIN user_details ud ON u.user_id = ud.user_id
         WHERE u.user_id = $1`,
      [userId]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "User not found" });
    }
    const mobileNumber = user.rows[0].mobile_number;
    const userDir = `uploads/${mobileNumber}`;

    await pool.query("DELETE FROM users WHERE user_id = $1", [userId]);

    // Delete user directory if it exists

    if (fs.existsSync(userDir)) {
      fs.rmdirSync(userDir, { recursive: true, force: true });
    }
    res.json({ status: "AK", message: "User deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting user" });
  }
};
const getUserDetailsByMobileNumber = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE mobile_number = $1",
      [mobile_number]
    );
    if (userDetails.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User details not found" });
    }
    res.json({ status: "AK", data: userDetails.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user details" });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `
      SELECT
        u.user_id,
        u.email,
        u.is_verified,
        u.is_active,
        u.password_last_changed,
        u.created_at,
        u.updated_at,
        ud.first_name,
        ud.middle_name,
        ud.last_name,
        ud.dob,
        ud.father_full_name,
        ud.nin_number,
        ud.mobile_number,
        ud.citizenship_number,
        ud.citizenship_issue_date,
        ud.bank_account_number,
        ud.bank_name,
        ud.gender_id,
        g.name AS gender,
        ud.country_id AS birth_country_id,
        c.nicename AS birth_country,
        ud.birth_province_id,
        p.name AS birth_province,
        ud.birth_district_id,
        d.name AS birth_district
      FROM users u
      LEFT JOIN user_details ud ON u.user_id = ud.user_id
      LEFT JOIN gender g ON ud.gender_id = g.id
      LEFT JOIN country c ON ud.country_id = c.id
      LEFT JOIN province p ON ud.birth_province_id = p.id
      LEFT JOIN district d ON ud.birth_district_id = d.id
      WHERE u.user_id = $1
      `,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No user found." });
    }
    res.json({ status: "AK", data: result.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user profile" });
  }
};

module.exports = {
  createUser,
  getUserByUserId,
  getUserProfile,
  updateUserDetails,
  updateAddress,
  deleteUser,
  getUserDetailsByMobileNumber,
};
