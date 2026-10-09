import { MulterFile } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; userType?: string };
      files?: MulterFile[];
    }
  }
}
