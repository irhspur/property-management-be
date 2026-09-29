import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboardService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const dashboard = await dashboardService.getDashboard(req.user!.id);
    res.json({ status: 'AK', data: dashboard });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, cursor } = req.query;
    const result = await dashboardService.getActivity(req.user!.id, {
      limit: limit !== undefined ? Number(limit) : undefined,
      cursor: cursor as string | undefined,
    });
    res.json({ status: 'AK', ...result });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
