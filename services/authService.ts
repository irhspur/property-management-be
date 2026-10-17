import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user';
import * as ownerTenantModel from '../models/ownerTenant';
import {
  jwtGenerator,
  generateVerificationToken,
  generateResetToken,
  EmailTokenPurpose,
} from '../utils/jwtGenerator';
import sendEmail from '../utils/email';
import { User } from '../types';
import { isPasswordExpired } from '../utils/passwordExpiry';
import { appError } from '../utils/appError';

const INVALID_TOKEN = 'Invalid or expired token';

interface EmailToken {
  email: string;
  purpose?: EmailTokenPurpose; // absent on verification links sent before purposes
}

// Verifies an emailed token. An expired Invite gets its own code, so the FE
// can tell the Tenant to ask for a new one; the purpose of an expired token
// is only readable by decoding it.
const verifyEmailToken = (token: string): EmailToken => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string) as EmailToken;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError && (jwt.decode(token) as EmailToken | null)?.purpose === 'invite') {
      throw appError('This invite has expired, ask your Property Owner to resend it', 400, 'INVITE_EXPIRED');
    }
    throw appError(INVALID_TOKEN, 400);
  }
};

export const register = async (fields: {
  email: string;
  password: string;
  user_type_id: number;
}): Promise<{ user: Omit<User, 'password'>; token: string }> => {
  const existing = await userModel.findByEmail(fields.email);
  if (existing) throw appError('Email already exists', 400);

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
  return { user: userModel.toSafeUser(user), token };
};

export const resendVerification = async (email: string): Promise<void> => {
  const user = await userModel.findByEmail(email);
  if (!user) throw appError('Email not found', 404);
  if (user.is_verified) throw appError('Account is already verified', 400);

  const token = generateVerificationToken(email);
  const verifyLink = `${process.env.BASE_URL}/verify-email?token=${token}`;
  const html = `<p>Please verify your email by clicking the link below:</p>
  <p><a href="${verifyLink}">${verifyLink}</a></p>
  <p>This link is valid for 24 hours.</p>
  <p>If you did not request this, please ignore this email.</p>`;

  await sendEmail(email, 'Email Verification', html);
};

// Takes `verify` tokens, and tokens without a purpose (24h links issued
// before purposes existed). Never a reset or Invite token.
export const verifyEmail = async (token: string): Promise<void> => {
  const decoded = verifyEmailToken(token);
  if (decoded.purpose !== undefined && decoded.purpose !== 'verify') throw appError(INVALID_TOKEN, 400);
  const count = await userModel.setVerified(decoded.email);
  if (count === 0) throw appError(INVALID_TOKEN, 400);
};

export const login = async (fields: {
  email: string;
  password: string;
}): Promise<{ user: Omit<User, 'password'> & { user_type: string }; token: string }> => {
  const user = await userModel.findWithRoleByEmail(fields.email);
  if (!user) throw appError('Invalid email', 400);
  // Before the password: an invitee has no usable one yet.
  if (user.invite_pending) {
    const whoToAsk = user.user_type === 'admin' ? 'another admin' : 'your Property Owner';
    throw appError(`Check your email for your invite, or ask ${whoToAsk} to resend it.`, 403, 'INVITE_PENDING');
  }

  const isMatch = await bcrypt.compare(fields.password, user.password);
  if (!isMatch) throw appError('Invalid password', 400);

  if (!user.is_verified) throw appError('User not verified', 403, 'NOT_VERIFIED');
  if (!user.is_active) throw appError('User is inactive', 403, 'INACTIVE');

  if (isPasswordExpired(user.password_last_changed)) {
    throw appError('Password expired. Please reset or change your password.', 403, 'PASSWORD_EXPIRED');
  }

  // Checked at login only, not in authorize(): a session started before the
  // owner was deactivated lives out its JWT.
  if (user.user_type === 'tenant' && !(await ownerTenantModel.hasActiveOwner(user.user_id))) {
    throw appError("Your Property Owner's account isn't active. Contact them for access.", 403, 'OWNER_INACTIVE');
  }

  const token = jwtGenerator(user.user_id);
  return { user: { ...userModel.toSafeUser(user), user_type: user.user_type }, token };
};

export const forgotPassword = async (email: string): Promise<{ token: string }> => {
  const user = await userModel.findByEmail(email);
  if (!user) throw appError('Email not found', 400);

  const token = generateResetToken(email);
  const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;

  const html = `<p>Please reset your password by clicking the link below:</p>
  <p><a href="${resetLink}">${resetLink}</a></p>
  <p>This link is valid for 15 minutes.</p>`;

  await sendEmail(email, 'Password Reset', html);
  return { token };
};

// Takes a reset token or an Invite token. An Invite works only while the
// Tenant is invite pending, so a used one can't act as a 7-day reset link.
// Either kind clears invite pending and verifies the user (the emailed link
// proves they control the address).
export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const decoded = verifyEmailToken(token);
  if (decoded.purpose !== 'reset' && decoded.purpose !== 'invite') throw appError(INVALID_TOKEN, 400);
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const user =
    decoded.purpose === 'invite'
      ? await userModel.acceptInvite(decoded.email, hashedPassword)
      : await userModel.updatePasswordByEmail(decoded.email, hashedPassword);
  if (!user) throw appError(INVALID_TOKEN, 400);
};

export const changePassword = async (userId: string, oldPassword: string, newPassword: string): Promise<void> => {
  const user = await userModel.findById(userId);
  if (!user) throw appError('User not found', 400);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw appError('Invalid old password', 400);

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) throw appError('New password must be different from the current password', 400);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updatePasswordById(userId, hashedPassword);
};
