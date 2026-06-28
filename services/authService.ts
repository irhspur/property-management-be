import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user';
import { jwtGenerator, generateVerificationToken, generateResetToken } from '../utils/jwtGenerator';
import sendEmail from '../utils/email';
import { User } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const register = async (fields: {
  email: string;
  password: string;
  user_type_id: number;
}): Promise<{ user: User; token: string }> => {
  const existing = await userModel.findByEmail(fields.email);
  if (existing) throw err('Email already exists', 400);

  const hashedPassword = await bcrypt.hash(fields.password, 10);
  const token = generateVerificationToken(fields.email);
  const verifyLink = `${process.env.BASE_URL}/verify-email?token=${token}`;

  const html = `<p>Please verify your email by clicking the link below:</p>
  <p><a href="${verifyLink}">${verifyLink}</a></p>
  <p>This link is valid for 24 hours.</p>
  <p>If you did not request this, please ignore this email.</p>`;

  const user = await userModel.create({ email: fields.email, password: hashedPassword, user_type_id: fields.user_type_id });
  sendEmail(fields.email, 'Email Verification', html).catch(e =>
    console.error(`Verification email failed for ${fields.email}:`, e.message)
  );
  return { user, token };
};

export const resendVerification = async (email: string): Promise<void> => {
  const user = await userModel.findByEmail(email);
  if (!user) throw err('Email not found', 404);
  if (user.is_verified) throw err('Account is already verified', 400);

  const token = generateVerificationToken(email);
  const verifyLink = `${process.env.BASE_URL}/verify-email?token=${token}`;
  const html = `<p>Please verify your email by clicking the link below:</p>
  <p><a href="${verifyLink}">${verifyLink}</a></p>
  <p>This link is valid for 24 hours.</p>
  <p>If you did not request this, please ignore this email.</p>`;

  await sendEmail(email, 'Email Verification', html);
};

export const verifyEmail = async (token: string): Promise<void> => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { email: string };
  const count = await userModel.setVerified(decoded.email);
  if (count === 0) throw err('Invalid or expired token', 400);
};

export const login = async (fields: {
  email: string;
  password: string;
}): Promise<{ user: User; token: string }> => {
  const user = await userModel.findByEmail(fields.email);
  if (!user) throw err('Invalid email', 400);

  const isMatch = await bcrypt.compare(fields.password, user.password);
  if (!isMatch) throw err('Invalid password', 400);

  const expiry = new Date(user.password_last_changed);
  expiry.setFullYear(expiry.getFullYear() + 1);
  if (new Date() > expiry) throw err('Password expired. Please reset or change your password.', 400);

  if (!user.is_verified) throw err('User not verified', 403);
  if (!user.is_active) throw err('User is inactive', 403);

  const token = jwtGenerator(user.user_id);
  return { user, token };
};

export const forgotPassword = async (email: string): Promise<{ token: string }> => {
  const user = await userModel.findByEmail(email);
  if (!user) throw err('Email not found', 400);

  const token = generateResetToken(email);
  const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;

  const html = `<p>Please reset your password by clicking the link below:</p>
  <p><a href="${resetLink}">${resetLink}</a></p>
  <p>This link is valid for 15 minutes.</p>`;

  await sendEmail(email, 'Password Reset', html);
  return { token };
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { email: string };
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const user = await userModel.updatePasswordByEmail(decoded.email, hashedPassword);
  if (!user) throw err('Invalid or expired token', 400);
};

export const changePassword = async (userId: string, oldPassword: string, newPassword: string): Promise<void> => {
  const user = await userModel.findById(userId);
  if (!user) throw err('User not found', 400);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw err('Invalid old password', 400);

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) throw err('New password must be different from the current password', 400);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updatePasswordById(userId, hashedPassword);
};
