import type { NextFunction, Request, Response } from 'express';
import {
  getJwtSecret,
  TokenError,
  verifyAccessToken,
  type VerifiedToken,
} from '../services/auth/tokenService.js';
import { getCookieToken } from '../services/auth/sessionCookie.js';
import { HttpError } from './authenticate.js';

export type AuthenticatedUser = { userId: string };

export type AuthenticateTokenDependencies = {
  verifyToken?: (token: string) => VerifiedToken;
};

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  const scheme = parts[0];
  const token = parts[1];
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token || token.trim() === '') {
    return null;
  }
  return token;
}

export function createAuthenticateToken(
  dependencies: AuthenticateTokenDependencies = {}
) {
  const verifyToken =
    dependencies.verifyToken ??
    ((token: string) => verifyAccessToken(token, getJwtSecret()));

  return async function authenticateToken(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const bearerToken = getBearerToken(req.header('authorization'));
      const cookieToken = getCookieToken(req);
      const token = bearerToken ?? cookieToken;
      if (!token) {
        throw new HttpError(401, 'Authentication is required.');
      }

      const verified = verifyToken(token);
      req.authUser = { userId: verified.sub };
      next();
    } catch (error) {
      if (error instanceof TokenError) {
        next(new HttpError(401, error.message));
        return;
      }
      next(error);
    }
  };
}

export const authenticateToken = createAuthenticateToken();
