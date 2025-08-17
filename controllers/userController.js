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
      birth_district_id,
      father_full_name,
      nin_number,
      mobile_number,
      citizenship_number,
      citizenship_issue_district_id,
      citizenship_issue_date,
      bank_account_number,
      bank_name,
    } = req.body;

    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE mobile_number = $1",
      [mobile_number]
    );
    if (userDetails.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Mobile Number already exist" });
    }
    const newUserDetails = await pool.query(
      `
            INSERT INTO user_details (
                user_id,
                first_name, 
                middle_name, 
                last_name, 
                gender_id, 
                dob, 
                country_id, 
                birth_district_id, 
                father_full_name, 
                nin_number, 
                mobile_number, 
                citizenship_number, 
                citizenship_issue_district_id, 
                citizenship_issue_date, 
                bank_account_number, 
                bank_name
            ) 
            VALUES (
                $1,
                INITCAP($2), 
                INITCAP($3), 
                INITCAP($4), 
                $5, 
                $6, 
                $7, 
                $8, 
                INITCAP($9), 
                $10, 
                $11, 
                $12, 
                $13, 
                $14, 
                $15, 
                INITCAP($16)
            ) RETURNING *
            `,
      [
        userId,
        first_name,
        middle_name,
        last_name,
        gender_id,
        dob,
        birth_country_id,
        birth_district_id,
        father_full_name,
        nin_number,
        mobile_number,
        citizenship_number,
        citizenship_issue_district_id,
        citizenship_issue_date,
        bank_account_number,
        bank_name,
      ]
    );

    const {
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
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1 AND country_id = $2 AND province_id = $3 AND district_id = $4 AND municipality_id = $5",
      [userId, address_country_id, province_id, district_id, municipality_id]
    );
    if (address.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Address already exists for this user",
      });
    }
    const newUserAddress = await pool.query(
      `
              INSERT INTO address (
                  user_id, 
                  country_id, 
                  province_id, 
                  district_id, 
                  municipality_id, 
                  ward_number, 
                  street_name, 
                  house_number, 
                  contact_number_1, 
                  contact_number_2, 
                  contact_address
              ) 
              VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), INITCAP($8), $9, $10, INITCAP($11)) RETURNING *
              `,
      [
        userId,
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
      ]
    );
    await pool.query("COMMIT");
    res.json({
      status: "AK",
      data: {
        newUserDetails: newUserDetails.rows[0],
        newUserAddressAddress: newUserAddress.rows[0],
      },
      message: "User created successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating User" });
  }
};

const getUserByUserId = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await pool.query(
      `
      SELECT 
        u.user_id AS user_id,
        ud.first_name,
        ud.middle_name,
        ud.last_name,
        u.email,
        g.name AS gender,
        ud.dob,
        c.name AS country,
        d.name AS birth_district,
        ud.father_full_name,
        ud.nin_number,
        ud.mobile_number,
        ud.citizenship_number,
        d2.name AS citizenship_issue_district,
        ud.citizenship_issue_date,
        ud.bank_account_number,
        ud.bank_name,
        c1.name AS address_country,
        p.name AS province,
        d3.name AS address_district,
        m.name AS municipality,
        a.ward_number,
        a.street_name,
        a.house_number,
        a.contact_number_1,
        a.contact_number_2,
        a.contact_address,
        ut.name AS user_type,
        u.is_verified,
        u.is_active,
        u.password_last_changed,
        u.created_at,
        u.updated_at
      FROM users u
      JOIN user_details ud ON u.user_id = ud.user_id
      JOIN user_type ut ON u.user_type_id = ut.id
      JOIN gender g ON ud.gender_id = g.id
      JOIN country c ON ud.country_id = c.id
      JOIN district d ON ud.birth_district_id = d.id
      JOIN district d2 ON ud.citizenship_issue_district_id = d2.id
      JOIN address a ON u.user_id = a.user_id
      JOIN country c1 ON a.country_id = c1.id
      JOIN province p ON a.province_id = p.id
      JOIN district d3 ON a.district_id = d3.id
      JOIN municipality m ON a.municipality_id = m.id
      WHERE u.user_id = $1
      `,
      [userId]
    );
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
            birth_district_id = $7,
            father_full_name = INITCAP($8),
            nin_number = $9,
            mobile_number = $10,
            citizenship_number = $11,
            citizenship_issue_district_id = $12,
            citizenship_issue_date = $13,
            bank_account_number = $14,
            bank_name = INITCAP($15),
            updated_at = NOW()
            WHERE user_id = $16 RETURNING *
            `,
      [
        first_name,
        middle_name,
        last_name,
        gender_id,
        dob,
        country_id,
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
    const { mobile_number } = req.params;
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

module.exports = {
  createUser,
  getUserByUserId,
  updateUserDetails,
  updateAddress,
  deleteUser,
  getUserDetailsByMobileNumber,
};
