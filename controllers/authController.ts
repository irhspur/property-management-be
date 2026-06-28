import { Request, Response } from 'express';
import * as authService from '../services/authService';

const respond = (res: Response, error: any): void => {
  res.status(error.statusCode || 500).json({ status: 'NAK', message: error.message });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, user_type_id } = req.body;
    const { user, token } = await authService.register({ email, password, user_type_id });
    res.json({
      status: 'AK',
      message: 'User registered successfully. Please check your email to verify your account.',
      data: user,
      token,
    });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    await authService.verifyEmail(req.query.token as string);
    res.json({ status: 'AK', message: 'Email verified successfully' });
  } catch (error) {
    console.error((error as Error).message);
    res.status((error as any).statusCode || 400).json({ status: 'NAK', message: 'Invalid or expired token' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login({ email, password });
    res.json({ status: 'AK', data: user, token });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = await authService.forgotPassword(req.body.email);
    res.json({ status: 'AK', message: 'Password reset link sent to email', token });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    await authService.resetPassword(req.query.token as string, req.body.newPassword);
    res.json({ status: 'AK', message: 'Password reset successfully' });
  } catch (error) {
    console.error((error as Error).message);
    res.status((error as any).statusCode || 400).json({ status: 'NAK', message: 'Invalid or expired token' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.id, oldPassword, newPassword);
    res.json({ status: 'AK', message: 'Password changed successfully' });
  } catch (error) {
    console.error((error as Error).message);
    respond(res, error);
  }
};
