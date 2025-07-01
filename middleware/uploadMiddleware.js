const pool = require("../config/database");

const preloadUserCategory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT
            ud.first_name AS first_name,
            ud.mobile_number AS mobile_number,
            fc.name AS file_category_name,
            FROM user_details AS ud
            JOIN files AS f ON ud.user_id = f.user_id
            JOIN file_categories AS fc ON f.file_category_id = fc.id
            WHERE ud.user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "User not found" });
    }
    const result1 = await pool.query(
      `SELECT
            pfc.name AS property_file_category_name,
            FROM property_file_categories AS pfc
            JOIN files AS f ON pfc.id = f.property_file_category_id
            WHERE f.user_id = $1`,
      [userId]
    );

    req.userData = {
      firstName: result.rows[0].first_name,
      mobileNumber: result.rows[0].mobile_number,
      fileCategoryName: result.rows[0].file_category_name,
      propertyFileCategoryName: result1.rows[0].property_file_category_name,
    };
    next();
  } catch (error) {
    console.error(error.message);
    return res
      .status(500)
      .json({ status: "NAK", message: "Error preparing upload" });
  }
};
module.exports = preloadUserCategory;
