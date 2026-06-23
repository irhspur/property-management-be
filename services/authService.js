const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user");
const { jwtGenerator, generateVerificationToken, generateResetToken } = require("../utils/jwtGenerator");
const sendEmail = require("../utils/email");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const register = async ({ email, password, user_type_id }) => {
  const existing = await userModel.findByEmail(email);
  if (existing) throw err("Email already exists", 400);

  const hashedPassword = await bcrypt.hash(password, 10);
  const token = generateVerificationToken(email);
  const verifyLink = `${process.env.BASE_URL}/verify-email?token=${token}`;

  const html = `<p>Please verify your email by clicking the link below:</p>
  <p><a href="${verifyLink}">${verifyLink}</a></p>
  <p>This link is valid for 24 hours.</p>
  <p>If you did not request this, please ignore this email.</p>`;

  await sendEmail(email, "Email Verification", html);
  const user = await userModel.create({ email, password: hashedPassword, user_type_id });
  return { user, token };
};

const verifyEmail = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const count = await userModel.setVerified(decoded.email);
  if (count === 0) throw err("Invalid or expired token", 400);
};

const login = async ({ email, password }) => {
  const user = await userModel.findByEmail(email);
  if (!user) throw err("Invalid email", 400);

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw err("Invalid password", 400);

  const expiry = new Date(user.password_last_changed);
  expiry.setFullYear(expiry.getFullYear() + 1);
  if (new Date() > expiry) throw err("Password expired. Please reset or change your password.", 400);

  if (!user.is_verified) throw err("User not verified", 403);
  if (!user.is_active) throw err("User is inactive", 403);

  const token = jwtGenerator(user.user_id);
  return { user, token };
};

const forgotPassword = async (email) => {
  const user = await userModel.findByEmail(email);
  if (!user) throw err("Email not found", 400);

  const token = generateResetToken(email);
  const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;

  const html = `<p>Please reset your password by clicking the link below:</p>
  <p><a href="${resetLink}">${resetLink}</a></p>
  <p>This link is valid for 15 minutes.</p>`;

  await sendEmail(email, "Password Reset", html);
  return { token };
};

const resetPassword = async (token, newPassword) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const user = await userModel.updatePasswordByEmail(decoded.email, hashedPassword);
  if (!user) throw err("Invalid or expired token", 400);
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await userModel.findById(userId);
  if (!user) throw err("User not found", 400);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw err("Invalid old password", 400);

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) throw err("New password must be different from the current password", 400);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updatePasswordById(userId, hashedPassword);
};

module.exports = { register, verifyEmail, login, forgotPassword, resetPassword, changePassword };
