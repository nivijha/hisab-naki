import type { MembershipStatus, Prisma, PrismaClient, Role } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';
import {
  getJwtSecret,
  getTokenTtlSeconds,
  signAccessToken,
  TokenError,
} from './tokenService.js';
import { hashPassword, verifyPassword } from './passwordService.js';
import { logger } from '../../utils/logger.js';
import {
  PrismaMembershipLister,
  type MembershipLister,
  type MembershipSummary,
} from './membershipService.js';

export type AuthUserRecord = {
  id: string;
  passwordHash: string | null;
};

export type EmailOrPhoneRecord = {
  id: string;
  email: string | null;
  phone: string | null;
};

export interface AuthUserLookup {
  findByIdentifier(identifier: string): Promise<AuthUserRecord | null>;
  findByEmailOrPhone(email: string, phone: string | null): Promise<EmailOrPhoneRecord | null>;
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

  async findByEmailOrPhone(email: string, phone: string | null): Promise<EmailOrPhoneRecord | null> {
    const or: Prisma.UserWhereInput[] = [{ email: { equals: email, mode: 'insensitive' } }];
    if (phone) {
      or.push({ phone });
    }
    return this.client.user.findFirst({
      where: { OR: or },
      select: { id: true, email: true, phone: true },
    });
  }
}

export type LoginResult = {
  token: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  expiresIn: number;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  phone?: string | null;
};

export type RegisterResult = {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    phoneVerifiedAt: Date | null;
  };
  business: {
    id: string;
    name: string;
    currency: string;
  };
  membership: {
    id: string;
    role: Role;
    status: MembershipStatus;
  };
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
  client?: PrismaClient;
  hash?: (password: string) => Promise<string>;
};

// Cost of one real scrypt verification, used to keep timing similar for
// unknown accounts and accounts without a password.
const DUMMY_HASH =
  'scrypt$16384$8$1$00000000000000000000000000000000$' +
  '0000000000000000000000000000000000000000000000000000000000000000';

export function createAuthService(dependencies: AuthServiceDependencies = {}) {
  const userLookup = dependencies.userLookup ?? new PrismaAuthUserLookup();
  const membershipLister = dependencies.membershipLister ?? new PrismaMembershipLister();
  const client = dependencies.client ?? prisma;
  const hash = dependencies.hash ?? hashPassword;
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
      logger.warn('auth.login_failed', {
        reason: !user ? 'unknown_account' : !user.passwordHash ? 'no_password' : 'wrong_password',
      });
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

  async function register(input: RegisterInput): Promise<RegisterResult> {
    const name = input?.name?.trim();
    const email = input?.email?.trim().toLowerCase();
    const businessName = input?.businessName?.trim();
    const phone = input?.phone && input.phone.trim() ? input.phone.trim() : null;

    if (!name || !email || !businessName) {
      throw new HttpError(400, 'Name, email and business name are required.');
    }
    if (typeof input.password !== 'string' || input.password.trim().length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.');
    }

    const duplicate = await userLookup.findByEmailOrPhone(email, phone);
    if (duplicate) {
      if (phone && duplicate.phone === phone) {
        throw new HttpError(400, 'Phone number is already registered.');
      }
      throw new HttpError(400, 'Email address is already registered.');
    }

    const passwordHash = await hash(input.password.trim());

    const { user, business, membership } = await client.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name, email, phone, passwordHash },
      });
      const createdBusiness = await tx.business.create({
        data: { name: businessName },
      });
      const createdMembership = await tx.membership.create({
        data: {
          userId: createdUser.id,
          businessId: createdBusiness.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      return { user: createdUser, business: createdBusiness, membership: createdMembership };
    });

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

    logger.info('auth.registered', { userId: user.id, businessId: business.id });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
      },
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
      },
      token: issued.token,
      tokenType: 'Bearer',
      expiresAt: issued.expiresAt,
      expiresIn: expiresInSeconds,
    };
  }

  return { login, listMemberships, register };
}

export const authService = createAuthService();
