import { Response } from 'express';

// The NAK envelope for an error a controller caught. An app error (one with a
// statusCode) that has a `code` carries it for the FE to branch on; a driver
// error's code (pg's SQLSTATE) never leaves the server.
export const respond = (res: Response, error: any): void => {
  res
    .status(error.statusCode || 500)
    .json({ status: 'NAK', message: error.message, ...(error.statusCode && error.code ? { code: error.code } : {}) });
};
