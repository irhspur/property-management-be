const pool = require("../../config/database");

const getPropertyOwners = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    let query = `SELECT 
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
        ut.name AS user_type,
        u.is_verified,
        u.is_active,
        u.created_at
        FROM users u
        JOIN user_details ud ON u.user_id = ud.user_id
        JOIN user_type ut ON u.user_type_id = ut.id
        JOIN gender g ON ud.gender_id = g.id
        JOIN country c ON ud.country_id = c.id
        JOIN district d ON ud.birth_district_id = d.id
        JOIN district d2 ON ud.citizenship_issue_district_id = d2.id 
        WHERE u.user_type_id = 2`; // Assuming user_type_id 2 is for property owners
    const params = [];
    if (mobile_number) {
      query += " AND ud.mobile_number = $1";
      params.push(mobile_number);
    }
    query += " ORDER BY u.created_at DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No property owners found" });
    }
    return res.status(200).json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    return res
      .status(500)
      .json({ status: "NAK", message: "Error fetching property owners" });
  }
};

const getPropertyOwnersAddress = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    let query = `SELECT
    c.name AS country,
    p.name AS province,
    d.name AS district,
    m.name AS municipality,
    a.ward_number,
    a.street_name,
    a.house_number,
    a.contact_number_1,
    a.contact_number_2,
    a.contact_address,
    a.created_at
    FROM address a
    JOIN user_details ud ON a.user_id = ud.user_id
    JOIN country c ON a.country_id = c.id
    JOIN province p ON a.province_id = p.id
    JOIN district d ON a.district_id = d.id
    JOIN municipality m ON a.municipality_id = m.id
    JOIN users u ON ud.user_id = u.user_id
    WHERE u.user_type_id = 2`; // Assuming user_type_id 2 is for property owners
    const params = [];
    if (mobile_number) {
      query += " AND ud.mobile_number = $1";
      params.push(mobile_number);
    }
    query += " ORDER BY a.created_at DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No property owners address found" });
    }
    return res.status(200).json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      status: "NAK",
      message: "Error fetching property owners address",
    });
  }
};

const getPropertyOwnersDocuments = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    let query = `SELECT
        fc.name AS File_Category_Name,
        f.original_name AS Original_Name,
        f.mimetype AS Type,
        f.file_size AS Size,
        f.file_name AS File_Name,
        f.file_path AS File_Path,
        f.upload_date AS Upload_Date
        FROM files f
        JOIN file_categories fc ON f.file_category_id = fc.id
        JOIN user_details ud ON f.user_id = ud.user_id
        JOIN users u ON ud.user_id = u.user_id
        WHERE u.user_type_id = 2`; // Assuming user_type_id 2 is for property owners
    const params = [];
    if (mobile_number) {
      query += " AND ud.mobile_number = $1";
      params.push(mobile_number);
    }
    query += " ORDER BY f.upload_date DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No property owner documents found" });
    }
    return res.status(200).json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      status: "NAK",
      message: "Error fetching property owner documents",
    });
  }
};

module.exports = {
  getPropertyOwners,
  getPropertyOwnersAddress,
  getPropertyOwnersDocuments,
};
