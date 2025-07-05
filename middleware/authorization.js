const jwt = require("jsonwebtoken");
const pool = require("../config/database");
require("dotenv").config();

const authorize = (allowedUserTypes = []) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];
      //const jwtToken = req.header("token");
      if (!token) {
        return res
          .status(401)
          .json({ status: "NAK", message: "Token Missing" });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;

      const result = await pool.query(
        `SELECT 
                ut.name AS name, 
                u.is_verified AS is_verified, 
                u.is_active AS is_active
                FROM users AS u
                JOIN user_type AS ut ON u.user_type_id = ut.id
                WHERE u.user_id = $1`,
        [payload.id]
      );
      const user = result.rows[0];
      if (!user) {
        return res
          .status(404)
          .json({ status: "NAK", message: "User not found" });
      }
      if (!user.is_verified) {
        return res
          .status(403)
          .json({ status: "NAK", message: "User not verified" });
      }

      if (!user.is_active) {
        return res
          .status(403)
          .json({ status: "NAK", message: "User is inactive" });
      }
      if (allowedUserTypes.length && !allowedUserTypes.includes(user.name)) {
        return res
          .status(403)
          .json({ status: "NAK", message: "Access denied" });
      }

      next();
    } catch (error) {
      console.error(error.message);
      return res.status(401).json({ status: "NAK", message: "Unauthorized" });
    }
  };
};
module.exports = authorize;
