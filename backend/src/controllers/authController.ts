import type { Request, Response } from 'express';
import { authService, type RegisterInput } from '../services/auth/authService.js';

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body ?? {};
  const result = await authService.login(String(identifier ?? ''), String(password ?? ''));
  return res.json({ ok: true, data: result });
}

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register((req.body ?? {}) as RegisterInput);
  return res.status(201).json({ ok: true, data: result });
}

export async function membershipsHandler(req: Request, res: Response) {
  const userId = req.authUser?.userId;
  if (!userId) {
    return res.status(401).json({ ok: false, message: 'Authenticated user is required.' });
  }
  const memberships = await authService.listMemberships(userId);
  return res.json({ ok: true, data: memberships });
}
