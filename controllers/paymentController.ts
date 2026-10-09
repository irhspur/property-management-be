import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService';
import { generateViewToken } from '../utils/viewToken';
import { MulterFile } from '../types';

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`;

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await paymentService.createPayment(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.body
    );
    res.json({ status: 'AK', message: 'Payment recorded successfully', data: payment });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await paymentService.updatePayment(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string,
      req.body
    );
    res.json({ status: 'AK', message: 'Payment updated successfully', data: payment });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deletePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await paymentService.deletePayment(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string
    );
    res.json({ status: 'AK', message: 'Payment deleted successfully', data: payment });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const payment = await paymentService.getPayment(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string
    );
    res.json({ status: 'AK', data: payment });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPaymentsForAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await paymentService.getPaymentsForAgreement(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string
    );
    res.json({ status: 'AK', data: payments });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getStatement = async (req: Request, res: Response): Promise<void> => {
  try {
    const fiscalYearParam = req.query.fiscal_year;
    const fiscalYear = fiscalYearParam !== undefined ? Number(fiscalYearParam) : undefined;
    const statement = await paymentService.getStatement(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      fiscalYear
    );
    res.json({ status: 'AK', data: statement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getStatementByAgreementId = async (req: Request, res: Response): Promise<void> => {
  try {
    const fiscalYearParam = req.query.fiscal_year;
    const fiscalYear = fiscalYearParam !== undefined ? Number(fiscalYearParam) : undefined;
    const statement = await paymentService.getStatementByAgreementId(
      req.user!.id,
      req.params.agreementId as string,
      fiscalYear
    );
    res.json({ status: 'AK', data: statement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getLedger = async (req: Request, res: Response): Promise<void> => {
  try {
    const { property_id, tenant_id, from, to, limit, offset, all } = req.query;
    const result = await paymentService.getLedger(req.user!.id, {
      propertyId: property_id as string | undefined,
      tenantId: tenant_id as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
      all: all === 'true',
    });
    res.json({ status: 'AK', ...result });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getLedgerSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { property_id, tenant_id, from, to, trend_months } = req.query;
    const summary = await paymentService.getLedgerSummary(req.user!.id, {
      propertyId: property_id as string | undefined,
      tenantId: tenant_id as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      trendMonths: trend_months as string | undefined,
    });
    res.json({ status: 'AK', data: summary });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getArrears = async (req: Request, res: Response): Promise<void> => {
  try {
    const { property_id, tenant_id } = req.query;
    const arrears = await paymentService.getArrears(req.user!.id, {
      propertyId: property_id as string | undefined,
      tenantId: tenant_id as string | undefined,
    });
    res.json({ status: 'AK', data: arrears });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getReceipts = async (req: Request, res: Response): Promise<void> => {
  try {
    const receipts = await paymentService.getReceipts(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string
    );
    res.json({ status: 'AK', data: receipts });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const uploadReceipts = async (req: Request, res: Response): Promise<void> => {
  try {
    const created = await paymentService.uploadReceipts(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string,
      (req.files as MulterFile[] | undefined) ?? []
    );
    res.json({ status: 'AK', message: 'Receipts uploaded successfully', data: created });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getReceiptViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.params.tenantId as string;
    const fileId = req.params.fileId as string;
    await paymentService.getReceipt(
      req.user!.id,
      tenantId,
      req.params.agreementId as string,
      req.params.paymentId as string,
      fileId
    );
    const token = generateViewToken(fileId, tenantId);
    res.json({ status: 'AK', data: { url: `${baseUrl(req)}/files/view/${token}` } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteReceipt = async (req: Request, res: Response): Promise<void> => {
  try {
    await paymentService.deleteReceipt(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.paymentId as string,
      req.params.fileId as string
    );
    res.json({ status: 'AK', message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
