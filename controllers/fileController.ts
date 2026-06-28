import path from 'path';
import { Request, Response } from 'express';
import * as fileService from '../services/fileService';
import * as fileModel from '../models/file';
import { generateViewToken, verifyViewToken } from '../utils/viewToken';
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
    res.json({ status: 'AK', data: files });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await fileService.getFile(req.user!.id, req.params.fileId as string);
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
      req.user!.id, req.userData!, req.params.fileId as string, files[0], req.body.file_category_id
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
    await fileService.deleteFile(req.user!.id, req.params.fileId as string, { mobile_number, file_category_id });
    res.json({ status: 'AK', message: 'File deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const fileId = req.params.fileId as string;
    const file = await fileModel.findByIdWithOwnerCheck(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ status: 'NAK', message: 'File not found' });
      return;
    }
    const token = generateViewToken(fileId, req.user!.id);
    const base = `${req.protocol}://${req.get('host')}`;
    res.json({ status: 'AK', data: { url: `${base}/files/view/${token}` } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const serveFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = verifyViewToken(req.params.token as string);
    const file = await fileModel.findById(payload.file_id);
    if (!file) {
      res.status(404).json({ status: 'NAK', message: 'File not found' });
      return;
    }
    const abs = path.resolve(file.file_path);
    res.sendFile(abs);
  } catch (error) {
    res.status(401).json({ status: 'NAK', message: 'Invalid or expired view link' });
  }
};
