import { Request, Response } from 'express';
import * as agreementService from '../services/agreementService';
import * as fileStore from '../services/fileStore';
import { MulterFile } from '../types';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`;

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
    const { q, status, ending_before, property_id, tenant_id, sort, limit, offset } = req.query;
    const result = await agreementService.getAgreementsByOwner(req.user!.id, baseUrl(req), {
      q: q as string | undefined,
      status: status as string | undefined,
      endingBefore: ending_before as string | undefined,
      propertyId: property_id as string | undefined,
      tenantId: tenant_id as string | undefined,
      sort: sort as string | undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
    res.json({ status: 'AK', ...result });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await agreementService.getSummary(req.user!.id);
    res.json({ status: 'AK', data: summary });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementsForTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreements = await agreementService.getAgreementsForTenant(
      req.user!.id,
      req.params.tenantId as string,
      baseUrl(req)
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
      req.params.agreementId as string,
      baseUrl(req)
    );
    res.json({ status: 'AK', data: agreement });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementById = async (req: Request, res: Response): Promise<void> => {
  try {
    const agreement = await agreementService.getAgreementById(
      req.user!.id,
      req.params.agreementId as string,
      baseUrl(req)
    );
    res.json({ status: 'AK', message: 'Agreement fetched successfully', data: agreement });
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

export const getAgreementFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = await agreementService.getFiles(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string
    );
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const uploadAgreementFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No files uploaded' });
      return;
    }
    const created = await agreementService.uploadFiles(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      files,
      req.body.agreement_file_category_id
    );
    res.json({ status: 'AK', data: created, message: 'Documents uploaded successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAgreementFileViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await agreementService.getFile(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.fileId as string
    );
    res.json({ status: 'AK', data: { url: fileStore.viewUrl(file, baseUrl(req)) } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteAgreementFile = async (req: Request, res: Response): Promise<void> => {
  try {
    await agreementService.deleteFile(
      req.user!.id,
      req.params.tenantId as string,
      req.params.agreementId as string,
      req.params.fileId as string
    );
    res.json({ status: 'AK', message: 'File deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
