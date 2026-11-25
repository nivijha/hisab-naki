import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';
import { hashPassword } from './passwordService.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export type SignupInput = { name: string; phone: string; password: string };
export type SignupChallenge = {
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  signupName: string;
  signupPasswordHash: string;
};

export interface SignupRepository {
  userExistsByPhone(phone: string): Promise<boolean>;
  createPendingSignup(input: { name: string; phone: string; passwordHash: string; codeHash: string; expiresAt: Date }): Promise<void>;
  createReplacementChallenge(phone: string, codeHash: string, expiresAt: Date): Promise<boolean>;
  findActiveChallenge(phone: string): Promise<SignupChallenge | null>;
  recordFailedAttempt(challenge: SignupChallenge, now: Date, maxAttempts: number): Promise<void>;
  expireChallenge(challengeId: string): Promise<void>;
  cleanupExpiredSignupSecrets(now: Date): Promise<number>;
  consumeAndCreateUser(phone: string, challenge: SignupChallenge, now: Date, maxAttempts: number): Promise<boolean>;
}

export interface OtpDelivery {
  sendSignupCode(phone: string, code: string, expiresInSeconds: number): Promise<void>;
}

export function createOtpCodeHash(phone: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`signup\0${phone}\0${code}`).digest('hex');
}

function hashesMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(received, 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export function maskPhone(phone: string): string {
  const text = String(phone ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'\u2022'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function readOtpHashSecret(): string {
  return process.env.OTP_HASH_SECRET?.trim() ?? '';
}

/**
 * Startup validation: OTP_HASH_SECRET is required and must be ≥32 characters in
 * production. Called before the server listens (backend/src/server.ts).
 */
export function assertOtpHashSecretConfigured(): void {
  const explicit = readOtpHashSecret();
  if (explicit) {
    if (explicit.length < 32) {
      throw new Error('OTP_HASH_SECRET must be at least 32 characters.');
    }
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OTP_HASH_SECRET is required in production.');
  }
}

export function resolveOtpHashSecret(): string {
  const explicit = readOtpHashSecret();
  if (explicit) {
    if (explicit.length < 32) {
      throw new HttpError(503, 'OTP_HASH_SECRET must be at least 32 characters.');
    }
    return explicit;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new HttpError(503, 'OTP_HASH_SECRET is required in production.');
  }
  // Development fallback: reuse a valid JWT_SECRET when OTP_HASH_SECRET is unset.
  const fallback = process.env.JWT_SECRET?.trim() ?? '';
  if (fallback.length < 32) {
    throw new HttpError(503, 'Phone verification is not configured.');
  }
  return fallback;
}

class PendingSignupExists extends Error {}

export function createSignupService(dependencies: {
  repository: SignupRepository;
  delivery: OtpDelivery;
  hashSecret: string;
  now?: () => Date;
  generateCode?: () => string;
  passwordHasher?: (password: string) => Promise<string>;
}) {
  const now = dependencies.now ?? (() => new Date());
  const generateCode = dependencies.generateCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
  const passwordHasher = dependencies.passwordHasher ?? hashPassword;

  async function deliver(phone: string, code: string, expiresAt: Date) {
    try {
      await dependencies.delivery.sendSignupCode(phone, code, Math.ceil((expiresAt.getTime() - now().getTime()) / 1000));
    } catch {
      // Do not log or return the code, provider payload, or provider credentials.
      throw new HttpError(503, 'Could not send the verification code. Request a new code and try again.');
    }
  }

  async function register(input: SignupInput) {
    if (await dependencies.repository.userExistsByPhone(input.phone)) {
      throw new HttpError(409, 'This phone cannot be registered. If signup is pending, request a new code; otherwise sign in.');
    }
    const passwordHash = await passwordHasher(input.password);
    const code = generateCode();
    const expiresAt = new Date(now().getTime() + OTP_TTL_MS);
    const codeHash = createOtpCodeHash(input.phone, code, dependencies.hashSecret);
    try {
      await dependencies.repository.createPendingSignup({ ...input, passwordHash, codeHash, expiresAt });
    } catch (error) {
      if (error instanceof PendingSignupExists) {
        throw new HttpError(409, 'This phone cannot be registered. If signup is pending, request a new code; otherwise sign in.');
      }
      if (isUniqueConflict(error)) throw new HttpError(409, 'This phone cannot be registered. If signup is pending, request a new code; otherwise sign in.');
      throw error;
    }
    await deliver(input.phone, code, expiresAt);
    return { maskedPhone: maskPhone(input.phone), expiresAt, verificationRequired: true };
  }

  async function resend(phone: string) {
    const code = generateCode();
    const expiresAt = new Date(now().getTime() + OTP_TTL_MS);
    const codeHash = createOtpCodeHash(phone, code, dependencies.hashSecret);
    const pending = await dependencies.repository.createReplacementChallenge(phone, codeHash, expiresAt);
    if (pending) await deliver(phone, code, expiresAt);
    return { message: 'If signup verification is pending for this number, a new code has been sent.' };
  }

  async function verify(phone: string, code: string) {
    const challenge = await dependencies.repository.findActiveChallenge(phone);
    if (!challenge) throw new HttpError(400, 'The verification code is invalid or expired. Request a new code.');
    if (challenge.expiresAt.getTime() <= now().getTime() || challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await dependencies.repository.expireChallenge(challenge.id);
      throw new HttpError(400, 'The verification code is invalid or expired. Request a new code.');
    }
    if (!hashesMatch(challenge.codeHash, createOtpCodeHash(phone, code, dependencies.hashSecret))) {
      await dependencies.repository.recordFailedAttempt(challenge, now(), OTP_MAX_ATTEMPTS);
      throw new HttpError(400, 'The verification code is invalid or expired. Request a new code.');
    }
    if (!await dependencies.repository.consumeAndCreateUser(phone, challenge, now(), OTP_MAX_ATTEMPTS)) {
      throw new HttpError(400, 'The verification code is invalid or expired. Request a new code.');
    }
    return { verified: true };
  }

  return { register, resend, verify };
}

export class PrismaSignupRepository implements SignupRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async userExistsByPhone(phone: string): Promise<boolean> {
    return Boolean(await this.client.user.findUnique({ where: { phone }, select: { id: true } }));
  }

  async createPendingSignup(input: { name: string; phone: string; passwordHash: string; codeHash: string; expiresAt: Date }): Promise<void> {
    await this.client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.phone}, 0))`;
      const pending = await tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`SELECT "id", "expiresAt" FROM "OtpChallenge" WHERE "phone" = ${input.phone} AND "purpose" = 'SIGNUP'::"OtpPurpose" AND "userId" IS NULL AND "status" = 'ACTIVE'::"OtpStatus" ORDER BY "createdAt" DESC LIMIT 1`;
      if (pending[0] && pending[0].expiresAt.getTime() > Date.now()) throw new PendingSignupExists();
      if (pending[0]) await tx.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'EXPIRED'::"OtpStatus", "signupName" = NULL, "signupPasswordHash" = NULL WHERE "id" = ${pending[0].id}`;
      await tx.$executeRaw`INSERT INTO "OtpChallenge" ("id", "phone", "purpose", "channel", "codeHash", "status", "expiresAt", "attempts", "signupName", "signupPasswordHash", "createdAt") VALUES (${randomUUID()}, ${input.phone}, 'SIGNUP'::"OtpPurpose", 'SMS'::"OtpChannel", ${input.codeHash}, 'ACTIVE'::"OtpStatus", ${input.expiresAt}, 0, ${input.name}, ${input.passwordHash}, CURRENT_TIMESTAMP)`;
    });
  }

  async createReplacementChallenge(phone: string, codeHash: string, expiresAt: Date): Promise<boolean> {
    return this.client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`;
      const rows = await tx.$queryRaw<Array<{ id: string; expiresAt: Date; signupName: string | null; signupPasswordHash: string | null }>>`SELECT "id", "expiresAt", "signupName", "signupPasswordHash" FROM "OtpChallenge" WHERE "phone" = ${phone} AND "purpose" = 'SIGNUP'::"OtpPurpose" AND "userId" IS NULL AND "status" IN ('ACTIVE'::"OtpStatus", 'EXPIRED'::"OtpStatus") ORDER BY "createdAt" DESC LIMIT 1`;
      const previous = rows[0];
      if (!previous?.signupName || !previous.signupPasswordHash) return false;
      if (previous.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'EXPIRED'::"OtpStatus", "signupName" = NULL, "signupPasswordHash" = NULL WHERE "id" = ${previous.id}`;
        return false;
      }
      await tx.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'SUPERSEDED'::"OtpStatus", "signupName" = NULL, "signupPasswordHash" = NULL WHERE "id" = ${previous.id}`;
      await tx.$executeRaw`INSERT INTO "OtpChallenge" ("id", "phone", "purpose", "channel", "codeHash", "status", "expiresAt", "attempts", "signupName", "signupPasswordHash", "createdAt") VALUES (${randomUUID()}, ${phone}, 'SIGNUP'::"OtpPurpose", 'SMS'::"OtpChannel", ${codeHash}, 'ACTIVE'::"OtpStatus", ${expiresAt}, 0, ${previous.signupName}, ${previous.signupPasswordHash}, CURRENT_TIMESTAMP)`;
      return true;
    });
  }

  async findActiveChallenge(phone: string): Promise<SignupChallenge | null> {
    const rows = await this.client.$queryRaw<SignupChallenge[]>`SELECT "id", "codeHash", "expiresAt", "attempts", "signupName", "signupPasswordHash" FROM "OtpChallenge" WHERE "phone" = ${phone} AND "purpose" = 'SIGNUP'::"OtpPurpose" AND "status" = 'ACTIVE'::"OtpStatus" AND "userId" IS NULL ORDER BY "createdAt" DESC LIMIT 1`;
    const challenge = rows[0];
    if (!challenge?.signupName || !challenge.signupPasswordHash) return null;
    return { ...challenge, signupName: challenge.signupName, signupPasswordHash: challenge.signupPasswordHash };
  }

  async recordFailedAttempt(challenge: SignupChallenge, now: Date, maxAttempts: number): Promise<void> {
    const nextAttempts = challenge.attempts + 1;
    await this.client.$executeRaw`UPDATE "OtpChallenge" SET "attempts" = ${nextAttempts}, "status" = CASE WHEN ${nextAttempts} >= ${maxAttempts} THEN 'EXPIRED'::"OtpStatus" ELSE "status" END WHERE "id" = ${challenge.id} AND "status" = 'ACTIVE'::"OtpStatus" AND "attempts" = ${challenge.attempts} AND "expiresAt" > ${now}`;
  }

  async expireChallenge(challengeId: string): Promise<void> {
    await this.client.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'EXPIRED'::"OtpStatus", "signupName" = NULL, "signupPasswordHash" = NULL WHERE "id" = ${challengeId} AND "status" = 'ACTIVE'::"OtpStatus"`;
  }

  async cleanupExpiredSignupSecrets(now: Date): Promise<number> {
    return this.client.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'EXPIRED'::"OtpStatus", "signupName" = NULL, "signupPasswordHash" = NULL WHERE "purpose" = 'SIGNUP'::"OtpPurpose" AND "userId" IS NULL AND ("status" = 'ACTIVE'::"OtpStatus" AND "expiresAt" <= ${now} OR "status" = 'EXPIRED'::"OtpStatus") AND "signupPasswordHash" IS NOT NULL`;
  }

  async consumeAndCreateUser(phone: string, challenge: SignupChallenge, now: Date, maxAttempts: number): Promise<boolean> {
    try {
      return await this.client.$transaction(async tx => {
        if (challenge.attempts >= maxAttempts) return false;
        const consumed = await tx.$executeRaw`UPDATE "OtpChallenge" SET "status" = 'CONSUMED'::"OtpStatus", "consumedAt" = ${now} WHERE "id" = ${challenge.id} AND "status" = 'ACTIVE'::"OtpStatus" AND "attempts" = ${challenge.attempts} AND "expiresAt" > ${now}`;
        if (consumed !== 1) return false;
        const user = await tx.user.create({
          data: { name: challenge.signupName, phone, passwordHash: challenge.signupPasswordHash, phoneVerifiedAt: now },
          select: { id: true },
        });
        await tx.$executeRaw`UPDATE "OtpChallenge" SET "userId" = ${user.id}, "signupName" = NULL, "signupPasswordHash" = NULL WHERE "id" = ${challenge.id}`;
        return true;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isUniqueConflict(error)) throw new HttpError(409, 'This phone cannot be registered. If signup is pending, request a new code; otherwise sign in.');
      throw error;
    }
  }
}
