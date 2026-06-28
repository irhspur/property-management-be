import { Request, Response } from 'express';
import * as propertyFileService from '../services/propertyFileService';
import { MulterFile } from '../types';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createPropertyFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No files uploaded' });
      return;
    }
    if (files.length > 1) {
      res.status(400).json({ status: 'NAK', message: 'Only one file allowed per category. Upload one file at a time.' });
      return;
    }
    const record = await propertyFileService.createFile(
      req.user!.id, req.params.property_id as string, req.userData!, files[0], req.body.property_file_category_id
    );
    res.json({ status: 'AK', message: 'File uploaded successfully', data: record });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPropertyFilesByFileId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { property_file_category_id } = req.query as Record<string, string>;
    const files = await propertyFileService.getFileById(req.user!.id, req.params.fileId as string, { property_file_category_id });
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

export const getPropertyFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { property_file_category_id, mobile_number, property_id } = req.query as Record<string, string>;
    const files = await propertyFileService.getFiles(req.user!.id, { property_file_category_id, mobile_number, property_id });
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updatePropertyFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No file provided for update.' });
      return;
    }
    const updated = await propertyFileService.updateFile(
      req.user!.id, req.params.fileId as string, req.userData!, files[0], req.body.property_file_category_id
    );
    res.json({ status: 'AK', message: 'File updated successfully', data: updated });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deletePropertyFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile_number, property_file_category_id, property_id } = req.query as Record<string, string>;
    await propertyFileService.deleteFile(req.user!.id, req.params.fileId as string, { mobile_number, property_file_category_id, property_id });
    res.json({ status: 'AK', message: 'File deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
