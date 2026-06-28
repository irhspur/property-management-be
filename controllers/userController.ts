import { Request, Response } from 'express';
import * as userService from '../services/userService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await userService.upsertProfile(req.user!.id, req.body);
    res.json({ status: 'AK', data, message: 'User profile saved successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getUserByUserId = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await userService.getUser(req.user!.id);
    res.json({ status: 'AK', data: user });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await userService.getUserProfile(req.user!.id);
    res.json({ status: 'AK', data: profile });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const address = await userService.getAddress(req.user!.id);
    res.json({ status: 'AK', data: address });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateUserDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const details = await userService.updateDetails(req.user!.id, req.body);
    res.json({ status: 'AK', data: details });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const updateAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const address = await userService.updateAddress(req.user!.id, req.body);
    res.json({ status: 'AK', data: address, message: 'Address updated successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    await userService.deleteUser(req.user!.id);
    res.json({ status: 'AK', message: 'User deleted successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const getUserDetailsByMobileNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const details = await userService.getByMobileNumber(req.query.mobile_number as string);
    res.json({ status: 'AK', data: details });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
