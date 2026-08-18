import { Request, Response } from 'express';
import * as agreementService from '../services/agreementService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreement = await agreementService.createAgreement(
      req.user!.id,
      req.params.tenantId as string,
      req.body
    );
    res.json({ status: 'AK', message: 'Agreement created successfully', data: agreement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementsByOwner = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreements = await agreementService.getAgreementsByOwner(req.user!.id);
    res.json({ status: 'AK', data: agreements });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementsForTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreements = await agreementService.getAgreementsForTenant(
      req.user!.id,
      req.params.tenantId as string
    );
    res.json({ status: 'AK', data: agreements });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreement = await agreementService.getAgreement(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string
    );
    res.json({ status: 'AK', data: agreement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const endAgreement = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreement = await agreementService.endAgreement(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string
    );
    res.json({ status: 'AK', message: 'Agreement ended successfully', data: agreement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
