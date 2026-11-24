import type { Request, Response } from 'express';
import { HttpError } from '../middleware/authenticate.js';
import { PrismaSignupRepository, createSignupService } from '../services/auth/signupService.js';
import { HttpOtpDelivery } from '../services/auth/otpDelivery.js';

function signupService() {
  const hashSecret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
  if (!hashSecret || hashSecret.length < 32) {
    throw new HttpError(503, 'Phone verification is not configured.');
  }
  return createSignupService({ repository: new PrismaSignupRepository(), delivery: new HttpOtpDelivery(), hashSecret });
}

export async function registerHandler(req: Request, res: Response) {
  const result = await signupService().register(req.body);
  return res.status(202).json({ ok: true, data: result });
}

export async function resendSignupCodeHandler(req: Request, res: Response) {
  const result = await signupService().resend(req.body.phone);
  return res.status(202).json({ ok: true, data: result });
}

export async function verifySignupCodeHandler(req: Request, res: Response) {
  const result = await signupService().verify(req.body.phone, req.body.code);
  return res.json({ ok: true, data: result });
}
