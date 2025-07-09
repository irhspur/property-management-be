const bcrypt = require("bcrypt");
const pool = require("../config/database");
const jwt = require("jsonwebtoken");
const {
  jwtGenerator,
  generateVerificationToken,
  generateResetToken,
} = require("../utils/jwtGenerator");
const sendEmail = require("../utils/email");
require("dotenv").config();

const register = async (req, res) => {
  try {
    const { email, password, user_type_id } = req.body;
    const user = await pool.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);
    if (user.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const token = generateVerificationToken(email);
    const verifyLink = `${process.env.BASE_URL}/verify-email?token=${token}`;

    const html = `<p>Please verify your email by clicking the link below:</p>
    <p><a href="${verifyLink}">${verifyLink}</a><p>
    <p>This link is valid for 24 hours.</p>
    <p>If you did not request this, please ignore this email.</p>`;

    await sendEmail(email, "Email Verification", html);

    const newUser = await pool.query(
      `INSERT INTO users (email, password, user_type_id, password_last_changed) 
   VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
   RETURNING *`,
      [email, hashedPassword, user_type_id]
    );

    res.json({
      status: "AK",
      message:
        "User registered successfully. Please check your email to verify your account.",
      data: newUser.rows[0],
      token: token,
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error registering user" });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const result = await pool.query(
      `UPDATE users
         SET is_verified = TRUE WHERE email = $1 RETURNING *`,
      [email]
    );

    console.log(result);

    if (result.rowCount === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Invalid or expired token" });
    }

    res.json({ status: "AK", message: "Email verified successfully" });
  } catch (error) {
    console.error(error.message);
    res
      .status(400)
      .json({ status: "NAK", message: "Invalid or expired token" });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await pool.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ status: "NAK", message: "Invalid email" });
    }
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Invalid password" });
    }
    const lastChanged = new Date(user.rows[0].password_last_changed);
    const currentTime = new Date();

    // Add 1 year to the password last changed date
    const expiryDate = new Date(lastChanged);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    if (currentTime > expiryDate) {
      return res.status(400).json({
        status: "NAK",
        message: "Password expired. Please reset or change your password.",
      });
    }

    if (!user.rows[0].is_verified) {
      return res
        .status(403)
        .json({ status: "NAK", message: "User not verified" });
    }

    if (!user.rows[0].is_active) {
      return res
        .status(403)
        .json({ status: "NAK", message: "User is inactive" });
    }
    const token = jwtGenerator(user.rows[0].user_id);

    res.json({ status: "AK", data: user.rows[0], token });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error logging in" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await pool.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);
    if (user.rows.length === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Email not found" });
    }

    const token = generateResetToken(email);
    const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;

    const html = `<p>Please reset your password by clicking the link below:</p>
    <p><a href="${resetLink}">${resetLink}</a><p>
    <p>This link is valid for 15 minutes.</p>`;

    await sendEmail(email, "Password Reset", html);

    res.json({
      status: "AK",
      message: "Password reset link sent to email",
      token,
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error processing request" });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const { newPassword, confirmNewPassword } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users SET password = $1, password_last_changed = CURRENT_TIMESTAMP WHERE email = $2 RETURNING *`,
      [hashedPassword, email]
    );

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Invalid or expired token" });
    }
    res.json({ status: "AK", message: "Password reset successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error resetting password" });
  }
};
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    const user = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [
      userId,
    ]);
    if (user.rows.length === 0) {
      return res.status(400).json({ status: "NAK", message: "User not found" });
    }
    const isMatch = await bcrypt.compare(oldPassword, user.rows[0].password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Invalid old password" });
    }
    const isSameAsCurrent = await bcrypt.compare(
      newPassword,
      user.rows[0].password
    );
    if (isSameAsCurrent) {
      return res.status(400).json({
        status: "NAK",
        message: "New password must be different from the current password",
      });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password = $1, password_last_changed = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING *`,
      [hashedNewPassword, userId]
    );
    res.json({ status: "AK", message: "Password changed successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error changing password" });
  }
};

module.exports = {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
};
