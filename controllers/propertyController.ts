import { Request, Response } from 'express';
import * as propertyService from '../services/propertyService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createProperty = async (req: Request, res: Response): Promise<void> => {
  try {
    const property = await propertyService.createProperty(req.user!.id, req.body);
    res.json({ status: 'AK', message: 'Property created successfully', data: property });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPropertiesByUserID = async (req: Request, res: Response): Promise<void> => {
  try {
    const properties = await propertyService.getProperties(req.user!.id);
    if (properties.length === 0) {
      res.status(404).json({ status: 'NAK', message: 'No properties found for this user' });
      return;
    }
    res.json({ status: 'AK', data: properties });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPropertyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const property = await propertyService.getById(req.params.id as string);
    res.json({ status: 'AK', data: property });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getPropertyByMobileNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const properties = await propertyService.getByMobileNumber(req.body.mobile_number);
    if (properties.length === 0) {
      res.status(404).json({ status: 'NAK', message: 'No properties found for this mobile number' });
      return;
    }
    res.json({ status: 'AK', data: properties });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateProperty = async (req: Request, res: Response): Promise<void> => {
  try {
    const property = await propertyService.updateProperty(req.params.id as string, req.user!.id, req.body);
    res.json({ status: 'AK', message: 'Property updated successfully', data: property });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteProperty = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await propertyService.deleteProperty(req.params.id as string, req.user!.id);
    res.json({ status: 'AK', message: 'Property deleted successfully', data: deleted });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
