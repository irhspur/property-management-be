import { Request, Response } from 'express';
import * as paymentService from '../services/paymentService';

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
    const { property_id, tenant_id, from, to } = req.query;
    const summary = await paymentService.getLedgerSummary(req.user!.id, {
      propertyId: property_id as string | undefined,
      tenantId: tenant_id as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
    });
    res.json({ status: 'AK', data: summary });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
