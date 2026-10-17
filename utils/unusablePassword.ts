import crypto from 'crypto';
import bcrypt from 'bcrypt';

// A bcrypt hash of random bytes: a real hash that no password matches. Given
// to an invited user until they set their own password.
export const unusablePassword = (): Promise<string> => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
