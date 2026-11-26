import type { Request, Response } from 'express';
import { HttpError } from '../middleware/authenticate.js';
import { isPrototypeSignupEnabled, prototypeSignupService } from '../services/auth/prototypeSignupService.js';
import { setSessionCookie } from '../services/auth/sessionCookie.js';

export async function prototypeSignupHandler(req: Request, res: Response) {
  if (!isPrototypeSignupEnabled()) {
    throw new HttpError(409, 'Prototype signup is not enabled in this environment.');
  }
  const result = await prototypeSignupService.register(req.body);
  setSessionCookie(res, result.token, result.expiresIn);
  const { token: _token, ...safe } = result;
  return res.status(201).json({ ok: true, data: safe });
}
