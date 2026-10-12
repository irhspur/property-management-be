import { Request, Response } from 'express';
import * as tenantPortalService from '../services/tenantPortalService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`;

// Every handler reads as the signed-in Tenant (req.user.id) and answers
// { status: 'AK', data }.
const read =
  (load: (req: Request, tenantId: string) => Promise<unknown>) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ status: 'AK', data: await load(req, req.user!.id) });
    } catch (error) {
      console.error((error as Error).message);
      respond(res, error);
    }
  };

export const getAgreements = read((req, tenantId) => tenantPortalService.getAgreements(tenantId, baseUrl(req)));

export const getAgreement = read((req, tenantId) =>
  tenantPortalService.getAgreement(tenantId, req.params.agreementId as string, baseUrl(req))
);
