import jwt from 'jsonwebtoken';
import 'dotenv/config';

interface ViewTokenPayload {
  file_id?: string;
  user_id: string;
  kind?: 'profile_photo';
}

export const generateViewToken = (fileId: string, userId: string): string =>
  jwt.sign({ file_id: fileId, user_id: userId }, process.env.JWT_SECRET as string, { expiresIn: '5m' });

export const verifyViewToken = (token: string): ViewTokenPayload =>
  jwt.verify(token, process.env.JWT_SECRET as string) as ViewTokenPayload;

// Profile photos are rendered as <img src> in list rows, which can't send an
// Authorization header and are reused from the client cache — hence 1h rather
// than the 5m document link. Carries no `id` claim, so it can never pass
// authorize() as a session token.
export const generatePhotoToken = (userId: string): string =>
  jwt.sign({ kind: 'profile_photo', user_id: userId }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
