import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const jwtGenerator = (id: number): string =>
  jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

export const generateVerificationToken = (email: string): string =>
  jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '24h' });

export const generateResetToken = (email: string): string =>
  jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
