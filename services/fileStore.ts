// File store (ADR-0010): the bytes behind a Document or a profile photo.
// Owns where bytes live and when they're written or removed relative to the
// database; the rows that point at them stay in their models (ADR-0010).
//
// Layout: <root>/<user_id>/<uuid><ext>. Never keyed by a name, mobile number
// or category — those change, or are missing, and stranded files when they
// did. `file_path` on a row is the full path, root included, so older rows
// in the previous layout keep resolving.
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { withTransaction } from '../utils/transaction';
import { generateViewToken, generatePhotoToken } from '../utils/viewToken';
import { MulterFile } from '../types';

// UPLOAD_ROOT moves where new files go (tests use a temp dir). Read on each
// call so a test can set it after import.
export const root = (): string => process.env.UPLOAD_ROOT || 'uploads';

// The extension comes from the type multer validated, not the client's file
// name: sendFile sets Content-Type from it.
const MIME_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };
const extensionOf = (file: MulterFile): string =>
  MIME_EXT[file.mimetype] ?? path.extname(file.originalname).toLowerCase();

export interface Placed {
  file: MulterFile;
  file_path: string;
}

// Writes each file's bytes under the user's directory, then runs `record` in
// a transaction to insert or update the rows that point at them. If `record`
// or the commit fails, the bytes just written are removed, so a row never
// points at a missing file. A crash between the two can leave a stray file;
// `npm run storage:sweep` finds those.
export const save = async <T>(
  userId: string,
  files: MulterFile[],
  record: (placed: Placed[], client: PoolClient) => Promise<T>
): Promise<T> => {
  const dir = path.join(root(), userId);
  const placed: Placed[] = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const file of files) {
      const filePath = path.join(dir, `${randomUUID()}${extensionOf(file)}`);
      fs.writeFileSync(filePath, file.buffer);
      placed.push({ file, file_path: filePath });
    }
    return await withTransaction((client) => record(placed, client));
  } catch (e) {
    discard(placed.map((p) => p.file_path));
    throw e;
  }
};

// Removes files whose rows are gone. Call after the delete commits; missing
// files are ignored, and a directory left empty is removed too, short of the
// root itself.
export const discard = (filePaths: (string | null | undefined)[]): void => {
  const base = path.resolve(root());
  for (const filePath of filePaths) {
    if (!filePath) continue;
    fs.rmSync(filePath, { force: true });
    const dir = path.resolve(path.dirname(filePath));
    if (dir === base || !fs.existsSync(dir)) continue;
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Another request wrote into it meanwhile; leave it.
    }
  }
};

// A Signed View URL for a stored Document (5 minutes). Call only after the
// caller's Ownership lookup has returned the file.
export const viewUrl = (file: Record<string, any>, baseUrl: string): string =>
  `${baseUrl}/files/view/${generateViewToken(file.file_id, file.user_id)}`;

// A Signed View URL for a user's profile photo (1 hour), or null without one.
export const photoUrl = (userId: string, photoPath: string | null | undefined, baseUrl: string): string | null =>
  photoPath ? `${baseUrl}/files/view/${generatePhotoToken(userId)}` : null;
