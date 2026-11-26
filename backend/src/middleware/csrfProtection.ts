import type { NextFunction, Request, Response } from 'express';
import { assertTrustedOriginForCookieAuth } from '../services/auth/sessionCookie.js';

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  try {
    assertTrustedOriginForCookieAuth(req);
    next();
  } catch (error) {
    next(error);
  }
}
