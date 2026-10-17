import { Request, Response } from 'express';
import * as reviewService from '../../services/identityReviewService';
import * as fileStore from '../../services/fileStore';
import { respond } from '../../utils/respond';

const baseUrl = (req: Request): string => `${req.protocol}://${req.get('host')}`;

export const getOwnerReviews = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ status: 'AK', data: await reviewService.listOwners() });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getOwnerReview = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ status: 'AK', data: await reviewService.getOwnerReview(req.params.userId as string) });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const reviewOwner = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await reviewService.reviewOwner(req.params.userId as string, req.body, req.user!.id);
    res.json({ status: 'AK', data, message: data.status === 'verified' ? 'Owner verified' : 'Owner rejected' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getOwnerDocumentViewUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = await reviewService.getOwnerDocument(req.params.userId as string, req.params.fileId as string);
    res.json({ status: 'AK', data: { url: fileStore.viewUrl(file, baseUrl(req)) } });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
