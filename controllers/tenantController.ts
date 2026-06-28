import { Request, Response } from 'express';
import * as tenantService from '../services/tenantService';
import { MulterFile } from '../types';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await tenantService.createTenant(req.user!.id, req.body);
    res.json({ status: 'AK', data, message: 'Tenant created successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getTenantsByPropertyOwnerId = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await tenantService.getTenantsByOwner(req.user!.id);
    if (tenants.length === 0) {
      res.status(404).json({ status: 'NAK', message: 'No tenants found for this property owner' });
      return;
    }
    res.json({ status: 'AK', data: tenants });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await tenantService.getTenant(req.user!.id, req.params.tenantId as string);
    res.json({ status: 'AK', data: tenant });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateTenantDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const details = await tenantService.updateDetails(req.user!.id, req.params.tenantId as string, req.body);
    res.json({ status: 'AK', data: details, message: 'Tenant details updated successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateTenantAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const address = await tenantService.updateAddress(req.user!.id, req.params.tenantId as string, req.body);
    res.json({ status: 'AK', data: address, message: 'Address updated successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const uploadFilesForTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.files || (req.files as MulterFile[]).length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No files uploaded' });
      return;
    }
    if ((req.files as MulterFile[]).length > 1) {
      res.status(400).json({ status: 'NAK', message: 'Only one file allowed per category. Upload one file at a time.' });
      return;
    }
    const doc = await tenantService.uploadFile(
      req.user!.id,
      req.params.tenantId as string,
      (req.files as MulterFile[])[0],
      req.body.file_category_id
    );
    res.json({ status: 'AK', data: doc, message: 'Document uploaded successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getTenantFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = await tenantService.getFiles(req.user!.id, req.params.tenantId as string);
    if (files.length === 0) {
      res.status(404).json({ status: 'NAK', message: 'No files found' });
      return;
    }
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getFileById = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await tenantService.getFile(req.user!.id, req.params.tenantId as string, req.params.fileId as string);
    res.json({ status: 'AK', data: file });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateTenantFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No file provided for update.' });
      return;
    }
    const updated = await tenantService.updateFile(
      req.user!.id,
      req.params.tenantId as string,
      req.params.fileId as string,
      files[0],
      req.body.file_category_id
    );
    res.json({ status: 'AK', data: updated, message: 'File updated successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteTenantFile = async (req: Request, res: Response): Promise<void> => {
  try {
    await tenantService.deleteFile(req.user!.id, req.params.tenantId as string, req.params.fileId as string);
    res.json({ status: 'AK', message: 'File deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    await tenantService.deleteTenant(req.user!.id, req.params.tenantId as string);
    res.json({ status: 'AK', message: 'Tenant records and files deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
