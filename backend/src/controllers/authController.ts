import type { Request, Response } from 'express';
import { authService, type RegisterInput } from '../services/auth/authService.js';
import { sessionService } from '../services/auth/sessionService.js';
import { clearSessionCookie, setSessionCookie } from '../services/auth/sessionCookie.js';

function browserAuthPayload<T extends { token: string; tokenType: string; expiresAt: Date; expiresIn: number }>(result: T) {
  const { token: _token, ...safe } = result;
  return safe;
}

export async function loginHandler(req: Request, res: Response) {
  const { identifier, password } = req.body ?? {};
  const result = await authService.login(String(identifier ?? ''), String(password ?? ''));
  setSessionCookie(res, result.token, result.expiresIn);
  return res.json({ ok: true, data: browserAuthPayload(result) });
}

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register((req.body ?? {}) as RegisterInput);
  setSessionCookie(res, result.token, result.expiresIn);
  return res.status(201).json({ ok: true, data: browserAuthPayload(result) });
}

export async function membershipsHandler(req: Request, res: Response) {
  const userId = req.authUser?.userId;
  if (!userId) {
    return res.status(401).json({ ok: false, message: 'Authenticated user is required.' });
  }
  const memberships = await authService.listMemberships(userId);
  return res.json({ ok: true, data: memberships });
}

export async function sessionHandler(req: Request, res: Response) {
  const userId = req.authUser?.userId;
  if (!userId) {
    return res.status(401).json({ ok: false, message: 'Authenticated user is required.' });
  }
  const session = await sessionService.getSession(userId);
  return res.json({ ok: true, data: session });
}

export async function logoutHandler(_req: Request, res: Response) {
  clearSessionCookie(res);
  return res.json({ ok: true, data: { loggedOut: true } });
}
