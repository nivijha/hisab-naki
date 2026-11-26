import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';
import { hashPassword } from './passwordService.js';
import { getJwtSecret, getTokenTtlSeconds, signAccessToken } from './tokenService.js';
import { normalizeEmail, normalizeOptionalPhone } from './identity.js';

export type PrototypeSignupUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

export type PrototypeSignupInput = {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
};

export type PrototypeSignupResult = {
  token: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  expiresIn: number;
  user: PrototypeSignupUser;
};

export interface PrototypeSignupRepository {
  createUser(input: { name: string; email: string; phone: string | null; passwordHash: string }): Promise<PrototypeSignupUser>;
}

export class PrismaPrototypeSignupRepository implements PrototypeSignupRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createUser(input: { name: string; email: string; phone: string | null; passwordHash: string }): Promise<PrototypeSignupUser> {
    const user = await this.client.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
      },
      select: { id: true, name: true, email: true, phone: true, phoneVerifiedAt: true },
    });
    return { ...user, email: user.email ?? input.email };
  }
}

export function isPrototypeSignupEnabled(): boolean {
  const raw = process.env.PROTOTYPE_SIGNUP_ENABLED?.trim().toLowerCase() ?? '';
  return raw === 'true' || raw === '1';
}

export function assertPrototypeSignupNotEnabledInProduction(): void {
  if (isPrototypeSignupEnabled() && process.env.NODE_ENV === 'production') {
    throw new Error('PROTOTYPE_SIGNUP_ENABLED cannot be used in production.');
  }
}

function getP2002Targets(error: unknown): string[] {
  if (!error || typeof error !== 'object') return [];
  const meta = 'meta' in error ? (error as { meta?: unknown }).meta : undefined;
  if (!meta || typeof meta !== 'object') return [];
  const target = 'target' in meta ? (meta as { target?: unknown }).target : undefined;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

export function mapUserUniqueConflict(error: unknown): HttpError | null {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return null;
  const targets = getP2002Targets(error).join(',').toLowerCase();
  if (targets.includes('phone')) {
    return new HttpError(409, 'This phone number is already registered.');
  }
  if (targets.includes('email')) {
    return new HttpError(409, 'This email is already registered. Please sign in with your email and password.');
  }
  // Fallback for drivers/adapters that omit target metadata.
  return new HttpError(409, 'An account with these details is already registered.');
}

export function createPrototypeSignupService(
  repository: PrototypeSignupRepository = new PrismaPrototypeSignupRepository()
) {
  async function register(input: PrototypeSignupInput): Promise<PrototypeSignupResult> {
    const name = input?.name?.trim();
    let email: string;
    let phone: string | null;
    try {
      email = normalizeEmail(String(input?.email ?? ''));
      phone = normalizeOptionalPhone(input?.phone);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'Invalid signup details.');
    }

    if (!name || !email) {
      throw new HttpError(400, 'Enter your name and a valid email address.');
    }
    if (typeof input.password !== 'string' || input.password.trim().length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.');
    }

    const passwordHash = await hashPassword(input.password);

    let user: PrototypeSignupUser;
    try {
      user = await repository.createUser({
        name,
        email,
        phone,
        passwordHash,
      });
    } catch (error) {
      const conflict = mapUserUniqueConflict(error);
      if (conflict) throw conflict;
      throw error;
    }

    const issued = signAccessToken(user.id, getJwtSecret(), getTokenTtlSeconds());
    return {
      token: issued.token,
      tokenType: 'Bearer',
      expiresAt: issued.expiresAt,
      expiresIn: getTokenTtlSeconds(),
      user,
    };
  }

  return { register };
}

export const prototypeSignupService = createPrototypeSignupService();
