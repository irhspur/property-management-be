// An error a service throws on purpose: `statusCode` is the HTTP status the
// controller answers with, and `code` (optional) a stable string the FE can
// branch on (see utils/respond.ts).
export type AppError = Error & { statusCode: number; code?: string };

export const appError = (message: string, statusCode = 500, code?: string): AppError =>
  Object.assign(new Error(message), { statusCode }, code ? { code } : {});
