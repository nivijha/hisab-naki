import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';
import {
  getJwtSecret,
  getTokenTtlSeconds,
  signAccessToken,
  TokenError,
} from './tokenService.js';
import { verifyPassword } from './passwordService.js';
import {
  PrismaMembershipLister,
  type MembershipLister,
  type MembershipSummary,
} from './membershipService.js';

export type AuthUserRecord = {
  id: string;
  passwordHash: string | null;
};

export interface AuthUserLookup {
  findByIdentifier(identifier: string): Promise<AuthUserRecord | null>;
}

export class PrismaAuthUserLookup implements AuthUserLookup {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findByIdentifier(identifier: string): Promise<AuthUserRecord | null> {
    const trimmed = identifier.trim();
    return this.client.user.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed, mode: 'insensitive' } },
          { phone: trimmed },
        ],
      },
      select: { id: true, passwordHash: true },
    });
  }
}

export type LoginResult = {
  token: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  expiresIn: number;
};

export type AuthServiceDependencies = {
  userLookup?: AuthUserLookup;
  membershipLister?: MembershipLister;
  secret?: string;
  expiresInSeconds?: number;
  now?: () => number;
  verify?: (password: string, hash: string) => Promise<boolean>;
};

// Cost of one real scrypt verification, used to keep timing similar for
// unknown accounts and accounts without a password.
const DUMMY_HASH =
  'scrypt$16384$8$1$00000000000000000000000000000000$' +
  '0000000000000000000000000000000000000000000000000000000000000000';

export function createAuthService(dependencies: AuthServiceDependencies = {}) {
  const userLookup = dependencies.userLookup ?? new PrismaAuthUserLookup();
  const membershipLister = dependencies.membershipLister ?? new PrismaMembershipLister();
  const expiresInSeconds = dependencies.expiresInSeconds ?? getTokenTtlSeconds();
  const now = dependencies.now ?? Date.now;
  const verify = dependencies.verify ?? verifyPassword;

  async function login(identifier: string, password: string): Promise<LoginResult> {
    if (
      typeof identifier !== 'string' ||
      identifier.trim() === '' ||
      typeof password !== 'string' ||
      password === ''
    ) {
      throw new HttpError(400, 'Identifier and password are required.');
    }

    const user = await userLookup.findByIdentifier(identifier);
    const storedHash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await verify(password, storedHash);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new HttpError(401, 'Invalid credentials.');
    }

    let issued;
    try {
      issued = signAccessToken(
        user.id,
        dependencies.secret ?? getJwtSecret(),
        expiresInSeconds,
        now
      );
    } catch (error) {
      if (error instanceof TokenError) {
        throw new HttpError(500, error.message);
      }
      throw error;
    }
    return {
      token: issued.token,
      tokenType: 'Bearer',
      expiresAt: issued.expiresAt,
      expiresIn: expiresInSeconds,
    };
  }

  async function listMemberships(userId: string): Promise<MembershipSummary[]> {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new HttpError(400, 'Authenticated user is required.');
    }
    return membershipLister.listActiveForUser(userId);
  }

  return { login, listMemberships };
}

export const authService = createAuthService();
