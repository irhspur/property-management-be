import * as userModel from '../models/user';
import { AdminSummary } from '../models/user';
import { generateInviteToken } from '../utils/jwtGenerator';
import { unusablePassword } from '../utils/unusablePassword';
import sendEmail from '../utils/email';
import { appError } from '../utils/appError';

// The admin console's set-password page, carrying a 7-day Invite token.
const inviteLink = (email: string): string => {
  if (!process.env.ADMIN_BASE_URL) throw appError('ADMIN_BASE_URL is not set', 500);
  return `${process.env.ADMIN_BASE_URL}/set-password?token=${generateInviteToken(email)}`;
};

// Not waited for: a failed send still leaves the inviting admin the link,
// returned to them to pass on another way.
const sendInvite = (email: string, link: string): void => {
  const html = `<p>You've been invited to the Proptrove admin console.</p>
  <p>Set your password to sign in:</p>
  <p><a href="${link}">${link}</a></p>
  <p>This link is valid for 7 days.</p>`;
  sendEmail(email, 'Set your Proptrove admin password', html).catch((e) =>
    console.error(`Admin invite email failed for ${email}:`, e.message)
  );
};

const summary = ({ user_id, email, invite_pending, is_active, created_at }: AdminSummary): AdminSummary => ({
  user_id,
  email,
  invite_pending,
  is_active,
  created_at,
});

export const listAdmins = (): Promise<AdminSummary[]> => userModel.findAdmins();

// Admins are invited, never self-registered: the invitee sets their own
// password from the link.
export const inviteAdmin = async (email: string): Promise<{ admin: AdminSummary; invite_link: string }> => {
  const link = inviteLink(email);
  if (await userModel.findByEmail(email)) throw appError('An account with this email already exists', 400);

  const admin = await userModel.createInvited({ email, password: await unusablePassword(), userType: 'admin' });
  sendInvite(email, link);
  return { admin: summary(admin), invite_link: link };
};

// A new link (new 7-day token, new email) for an admin who hasn't set a
// password yet.
export const resendAdminInvite = async (userId: string): Promise<{ invite_link: string }> => {
  const admin = await userModel.findAdminById(userId);
  if (!admin) throw appError('Admin not found', 404);
  if (!admin.invite_pending) throw appError('This admin has already set a password', 400);

  const link = inviteLink(admin.email);
  sendInvite(admin.email, link);
  return { invite_link: link };
};
