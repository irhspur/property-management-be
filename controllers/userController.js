const pool = require("../config/database");

const createUserDetails = async (req, res) => {
  try {
    const {
      firstname,
      middlename,
      lastname,
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
    const newUser = await pool.query(
      `
            INSERT INTO user_details (
                firstname, 
                middlename, 
                lastname, 
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
                INITCAP($1), 
                INITCAP($2), 
                INITCAP($3), 
                $4, 
                $5, 
                $6, 
                $7, 
                INITCAP($8), 
                $9, 
                $10, 
                $11, 
                $12, 
                $13, 
                $14, 
                INITCAP($15)
            ) RETURNING *
            `,
      [
        firstname,
        middlename,
        lastname,
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
        bank_name,
      ]
    );
    res.json({ status: "AK", data: newUser.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating user details" });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const userDetails = await pool.query("SELECT * FROM user_details");
    res.json({ status: "AK", data: userDetails.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user details" });
  }
};
const getUserDetailsById = async (req, res) => {
  try {
    const { id } = req.params;
    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE id = $1",
      [id]
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
const updateUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstname,
      middlename,
      lastname,
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
      bank_name,
    } = req.body;
    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE id = $1",
      [id]
    );
    if (userDetails.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User details not found" });
    }
    const updateUserDetails = await pool.query(
      `
            UPDATE user_details 
            SET 
            firstname = INITCAP($1), 
            middlename = INITCAP($2),
            lastname =  INITCAP($3),
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
            bank_name = INITCAP($15)
            WHERE id = $16 RETURNING *
            `,
      [
        firstname,
        middlename,
        lastname,
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
const deleteUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userDetails = await pool.query(
      "SELECT * FROM user_details WHERE id = $1",
      [id]
    );
    if (userDetails.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User details not found" });
    }
    await pool.query("DELETE FROM user_details WHERE id = $1", [id]);
    res.json({ status: "AK", message: "User details deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting user details" });
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
  createUserDetails,
  getUserDetails,
  getUserDetailsById,
  updateUserDetails,
  deleteUserDetails,
  getUserDetailsByMobileNumber,
};
