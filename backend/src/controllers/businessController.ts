import type { Request, Response } from 'express';
import { HttpError } from '../middleware/authenticate.js';
import { createBusinessOnboardingService, PrismaBusinessOnboardingRepository } from '../services/business/businessOnboardingService.js';

const businessOnboardingService = createBusinessOnboardingService(new PrismaBusinessOnboardingRepository());

export async function createFirstBusinessHandler(req: Request, res: Response) {
  const userId = req.authUser?.userId;
  if (!userId) throw new HttpError(401, 'Authenticated user is required.');
  const idempotencyKey = req.header('idempotency-key') ?? '';
  const result = await businessOnboardingService.createFirstBusiness(userId, req.body.name, idempotencyKey);
  return res.status(result.replayed ? 200 : 201).json({ ok: true, data: result });
}
