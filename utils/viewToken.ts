import jwt from 'jsonwebtoken';
import 'dotenv/config';

interface ViewTokenPayload {
  file_id: string;
  user_id: string;
}

export const generateViewToken = (fileId: string, userId: string): string =>
  jwt.sign({ file_id: fileId, user_id: userId }, process.env.JWT_SECRET as string, { expiresIn: '5m' });

export const verifyViewToken = (token: string): ViewTokenPayload =>
  jwt.verify(token, process.env.JWT_SECRET as string) as ViewTokenPayload;
