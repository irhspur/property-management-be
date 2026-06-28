import { Request, Response } from 'express';
import * as fileService from '../services/fileService';
import { MulterFile } from '../types';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createFile = async (req: Request, res: Response): Promise<void> => {
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
    const record = await fileService.createFile(req.user!.id, req.userData!, files[0], req.body.file_category_id);
    res.json({ status: 'AK', message: 'File uploaded successfully', data: record });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getFilesByUserID = async (req: Request, res: Response): Promise<void> => {
  try {
    const { file_category_id, mobile_number } = req.query as Record<string, string>;
    const files = await fileService.getFiles(req.user!.id, { file_category_id, mobile_number });
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

export const getFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await fileService.getFile(req.user!.id, Number(req.params.fileId));
    res.json({ status: 'AK', data: file });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      res.status(400).json({ status: 'NAK', message: 'No file provided for update.' });
      return;
    }
    const updated = await fileService.updateFile(
      req.user!.id, req.userData!, Number(req.params.fileId), files[0], req.body.file_category_id
    );
    res.json({ status: 'AK', message: 'File updated successfully', data: updated });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile_number, file_category_id } = req.query as Record<string, string>;
    await fileService.deleteFile(req.user!.id, Number(req.params.fileId), { mobile_number, file_category_id });
    res.json({ status: 'AK', message: 'File deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
