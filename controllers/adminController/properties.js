const pool = require("../../config/database");

const getProperties = async (req, res) => {
  try {
    const {
      mobile_number,
      property_type_id,
      district_id,
      is_vacant,
      property_owner_id,
    } = req.query;
    let query = `
        SELECT
            ud.first_name AS owner_first_name,
            ud.middle_name AS owner_middle_name,
            ud.last_name AS owner_last_name,
            pt.name AS property_type,
            p.property_name,
            c.name AS country,
            pr.name AS province,
            d.name AS district,
            m.name AS municipality,
            p.ward_number,
            p.street_name,
            p.house_number,
            p.is_vacant,
            p.property_description,
            p.created_at,
            p.updated_at
        FROM properties p
        JOIN property_types pt ON p.property_type_id = pt.id
        JOIN country c ON p.country_id = c.id
        JOIN province pr ON p.province_id = pr.id
        JOIN district d ON p.district_id = d.id
        JOIN municipality m ON p.municipality_id = m.id
        JOIN user_details ud ON p.user_id = ud.user_id
        JOIN users u ON p.user_id = u.user_id
        WHERE u.user_type_id = 2`; // Assuming user_type_id 2 is for property owners
    const params = [];
    let paramIndex = 1;
    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`; // Use parameterized query to prevent SQL injection
      params.push(mobile_number);
      paramIndex++;
    }
    if (property_type_id) {
      query += ` AND p.property_type_id = $${paramIndex}`;
      params.push(property_type_id);
      paramIndex++;
    }
    if (district_id) {
      query += ` AND p.district_id = $${paramIndex}`;
      params.push(district_id);
      paramIndex++;
    }
    if (is_vacant) {
      query += ` AND p.is_vacant = $${paramIndex}`;
      params.push(is_vacant);
      paramIndex++;
    }
    if (property_owner_id) {
      query += ` AND p.user_id = $${paramIndex}`;
      params.push(property_owner_id);
      paramIndex++;
    }

    query += " ORDER BY p.created_at DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No properties found" });
    }
    return res.status(200).json({ status: "OK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    return res
      .status(500)
      .json({ status: "NAK", message: "Error fetching properties" });
  }
};

const getPropertiesDocuments = async (req, res) => {
  try {
    const {
      mobile_number,
      property_owner_id,
      property_file_category_id,
      property_id,
    } = req.query;
    let query = `SELECT
          pfc.name AS Property_File_Category_Name,
          f.original_name AS Original_Name,
          f.mimetype AS Type,
          f.file_size AS Size,
          f.file_name AS File_Name,
          f.file_path AS File_Path,
          f.upload_date AS Upload_Date
          FROM files f
          JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
          JOIN user_details ud ON f.user_id = ud.user_id
          JOIN users u ON ud.user_id = u.user_id
          WHERE u.user_type_id = 2`; // Assuming user_type_id 2 is for property owners
    const params = [];
    let paramIndex = 1;
    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`; // Use parameterized query to prevent SQL injection
      params.push(mobile_number);
      paramIndex++;
    }
    if (property_owner_id) {
      query += ` AND f.user_id = $${paramIndex}`;
      params.push(property_owner_id);
      paramIndex++;
    }
    if (property_file_category_id) {
      query += ` AND f.property_file_category_id = $${paramIndex}`;
      params.push(property_file_category_id);
      paramIndex++;
    }
    if (property_id) {
      query += ` AND f.property_id = $${paramIndex}`;
      params.push(property_id);
      paramIndex++;
    }
    query += " ORDER BY f.upload_date DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No property documents found" });
    }
    return res.status(200).json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      status: "NAK",
      message: "Error fetching property documents",
    });
  }
};

module.exports = {
  getProperties,
  getPropertiesDocuments,
};
