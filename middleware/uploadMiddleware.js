const pool = require("../config/database");

const preloadUserCategory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT first_name, mobile_number FROM user_details WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "User not found" });
    }
    req.userData = {
      firstName: result.rows[0].first_name,
      mobileNumber: result.rows[0].mobile_number,
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
