import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const jwtGenerator = (id: string): string =>
  jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

// Every emailed token names what it is for, so one kind can't be used as another.
export type EmailTokenPurpose = 'verify' | 'reset' | 'invite';

const emailToken = (email: string, purpose: EmailTokenPurpose, expiresIn: '24h' | '15m' | '7d'): string =>
  jwt.sign({ email, purpose }, process.env.JWT_SECRET as string, { expiresIn });

export const generateVerificationToken = (email: string): string => emailToken(email, 'verify', '24h');

export const generateResetToken = (email: string): string => emailToken(email, 'reset', '15m');

export const generateInviteToken = (email: string): string => emailToken(email, 'invite', '7d');
