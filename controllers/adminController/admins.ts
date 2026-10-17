import { Request, Response } from 'express';
import * as adminService from '../../services/adminService';
import { respond } from '../../utils/respond';

export const getAdmins = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ status: 'AK', data: await adminService.listAdmins() });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

// The response carries the invite link on purpose, unlike a Tenant Invite:
// only an admin sees it, and it lets them pass it on when email is down.
export const inviteAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await adminService.inviteAdmin(req.body.email);
    res.json({ status: 'AK', data, message: 'Admin invited' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const resendAdminInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await adminService.resendAdminInvite(req.params.userId as string);
    res.json({ status: 'AK', data, message: 'Invite sent' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
