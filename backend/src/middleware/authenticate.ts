import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import {
  getJwtSecret,
  TokenError,
  verifyAccessToken,
  type VerifiedToken,
} from '../services/auth/tokenService.js';
import {
  PrismaMembershipLookup,
  type MembershipLookup,
} from '../services/auth/membershipService.js';
import { getCookieToken } from '../services/auth/sessionCookie.js';
import { getBearerToken } from './authenticateToken.js';

export type AuthContext = {
  userId: string;
  businessId: string;
  membershipId: string;
  role: Role;
};

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type AuthenticateDependencies = {
  verifyToken?: (token: string) => VerifiedToken;
  membershipLookup?: MembershipLookup;
};

export function createAuthenticate(dependencies: AuthenticateDependencies = {}) {
  const verifyToken =
    dependencies.verifyToken ??
    ((token: string) => verifyAccessToken(token, getJwtSecret()));
  const membershipLookup = dependencies.membershipLookup ?? new PrismaMembershipLookup();

  return async function authenticate(
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

      const businessId = req.header('x-business-id')?.trim();
      if (!businessId) {
        throw new HttpError(400, 'Business context is required.');
      }

      const membership = await membershipLookup.findActive(verified.sub, businessId);
      if (
        !membership ||
        membership.userId !== verified.sub ||
        membership.businessId !== businessId
      ) {
        throw new HttpError(403, 'No active membership for this business.');
      }

      req.auth = {
        userId: verified.sub,
        businessId: membership.businessId,
        membershipId: membership.id,
        role: membership.role,
      };

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

export const authenticate = createAuthenticate();

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new HttpError(401, 'Authentication context is required.');
  }
  return req.auth;
}
