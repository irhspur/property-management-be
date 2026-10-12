import { Request, Response } from 'express';
import * as tenantPortalService from '../services/tenantPortalService';
import * as fileStore from '../services/fileStore';
import { respond } from '../utils/respond';

// Every handler reads as the signed-in Tenant (req.user.id).

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`;

export const getAgreements = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreements = await tenantPortalService.getAgreements(req.user!.id, baseUrl(req));
    res.json({ status: 'AK', data: agreements });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreement = await tenantPortalService.getAgreement(
      req.user!.id,
      req.params.agreementId as string,
      baseUrl(req)
    );
    res.json({ status: 'AK', data: agreement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const fiscalYear = req.query.fiscal_year;
    const statement = await tenantPortalService.getStatement(
      req.user!.id,
      req.params.agreementId as string,
      fiscalYear !== undefined ? Number(fiscalYear) : undefined
    );
    res.json({ status: 'AK', data: statement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

// Payments, Payment Receipts and Agreement Documents.

export const getPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await tenantPortalService.getPayments(req.user!.id, req.params.agreementId as string);
    res.json({ status: 'AK', data: payments });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getReceipts = async (req: Request, res: Response): Promise<void> => {
  try {
    const receipts = await tenantPortalService.getReceipts(
      req.user!.id,
      req.params.agreementId as string,
      req.params.paymentId as string
    );
    res.json({ status: 'AK', data: receipts });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getReceiptViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const receipt = await tenantPortalService.getReceipt(
      req.user!.id,
      req.params.agreementId as string,
      req.params.paymentId as string,
      req.params.fileId as string
    );
    res.json({ status: 'AK', data: { url: fileStore.viewUrl(receipt, baseUrl(req)) } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = await tenantPortalService.getAgreementFiles(req.user!.id, req.params.agreementId as string);
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementFileViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await tenantPortalService.getAgreementFile(
      req.user!.id,
      req.params.agreementId as string,
      req.params.fileId as string
    );
    res.json({ status: 'AK', data: { url: fileStore.viewUrl(file, baseUrl(req)) } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

// The Tenant themselves: personal Documents, profile, Property Owner card.

export const getFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = await tenantPortalService.getFiles(req.user!.id);
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getFileViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await tenantPortalService.getFile(req.user!.id, req.params.fileId as string);
    res.json({ status: 'AK', data: { url: fileStore.viewUrl(file, baseUrl(req)) } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await tenantPortalService.getProfile(req.user!.id, baseUrl(req));
    res.json({ status: 'AK', data: profile });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getOwner = async (req: Request, res: Response): Promise<void> => {
  try {
    const owner = await tenantPortalService.getOwner(req.user!.id, baseUrl(req));
    res.json({ status: 'AK', data: owner });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
