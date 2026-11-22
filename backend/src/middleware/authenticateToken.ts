import type { NextFunction, Request, Response } from 'express';
import {
  getJwtSecret,
  TokenError,
  verifyAccessToken,
  type VerifiedToken,
} from '../services/auth/tokenService.js';
import { HttpError } from './authenticate.js';

export type AuthenticatedUser = { userId: string };

export type AuthenticateTokenDependencies = {
  verifyToken?: (token: string) => VerifiedToken;
};

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
      const authorization = req.header('authorization');
      if (!authorization) {
        throw new HttpError(401, 'Authorization header is required.');
      }

      const parts = authorization.split(' ');
      const scheme = parts[0];
      const token = parts[1];
      if (!scheme || scheme.toLowerCase() !== 'bearer' || !token || token.trim() === '') {
        throw new HttpError(401, 'Bearer token is required.');
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
