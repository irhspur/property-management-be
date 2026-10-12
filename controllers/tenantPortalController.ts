import { Request, Response } from 'express';
import * as tenantPortalService from '../services/tenantPortalService';
import * as fileStore from '../services/fileStore';
import { respond } from '../utils/respond';

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

export const getStatement = read((req, tenantId) => {
  const fiscalYear = req.query.fiscal_year;
  return tenantPortalService.getStatement(
    tenantId,
    req.params.agreementId as string,
    fiscalYear !== undefined ? Number(fiscalYear) : undefined
  );
});

// Payments, Payment Receipts and Agreement Documents.
export const getPayments = read((req, tenantId) =>
  tenantPortalService.getPayments(tenantId, req.params.agreementId as string)
);

export const getReceipts = read((req, tenantId) =>
  tenantPortalService.getReceipts(tenantId, req.params.agreementId as string, req.params.paymentId as string)
);

// A Signed View URL for a Document resolved as the Tenant's, as the owner
// view-url routes answer it.
const viewUrl =
  (find: (req: Request, tenantId: string) => Promise<Record<string, any>>) =>
  read(async (req, tenantId) => ({ url: fileStore.viewUrl(await find(req, tenantId), baseUrl(req)) }));

export const getReceiptViewUrl = viewUrl((req, tenantId) =>
  tenantPortalService.getReceipt(
    tenantId,
    req.params.agreementId as string,
    req.params.paymentId as string,
    req.params.fileId as string
  )
);

export const getAgreementFiles = read((req, tenantId) =>
  tenantPortalService.getAgreementFiles(tenantId, req.params.agreementId as string)
);

export const getAgreementFileViewUrl = viewUrl((req, tenantId) =>
  tenantPortalService.getAgreementFile(tenantId, req.params.agreementId as string, req.params.fileId as string)
);

// The Tenant themselves: personal Documents, profile, Property Owner card.
export const getFiles = read((_req, tenantId) => tenantPortalService.getFiles(tenantId));

export const getFileViewUrl = viewUrl((req, tenantId) =>
  tenantPortalService.getFile(tenantId, req.params.fileId as string)
);

export const getOwner = read((req, tenantId) => tenantPortalService.getOwner(tenantId, baseUrl(req)));

export const getProfile = read((req, tenantId) => tenantPortalService.getProfile(tenantId, baseUrl(req)));
