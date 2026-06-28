import { UserData, MulterFile } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; userType?: string };
      userData?: UserData;
      files?: MulterFile[];
    }
  }
}
