import { UserData, MulterFile } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; userType?: string };
      userData?: UserData;
      files?: MulterFile[];
    }
  }
}
