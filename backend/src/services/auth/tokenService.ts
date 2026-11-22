import { createHmac, timingSafeEqual } from 'node:crypto';

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export type VerifiedToken = {
  sub: string;
  iat?: number;
  exp: number;
};

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string, label: string): Record<string, unknown> {
  if (!BASE64URL.test(segment)) {
    throw new TokenError(`Malformed token ${label}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new TokenError(`Malformed token ${label}.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TokenError(`Malformed token ${label}.`);
  }

  return parsed as Record<string, unknown>;
}

const MIN_SECRET_LENGTH = 32;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new TokenError('JWT secret is not configured.');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new TokenError(`JWT secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const MAX_EXPIRES_IN_SECONDS = 24 * 60 * 60;

export function getTokenTtlSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN_SECONDS;
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_EXPIRES_IN_SECONDS);
    }
  }
  return DEFAULT_EXPIRES_IN_SECONDS;
}

export function signAccessToken(
  userId: string,
  secret: string,
  expiresInSeconds: number,
  now: () => number = Date.now
): { token: string; expiresAt: Date; iat: number; exp: number } {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TokenError('Token subject is required.');
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new TokenError('Token expiration must be a positive integer.');
  }

  const iat = Math.floor(now() / 1000);
  const exp = iat + expiresInSeconds;
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadSegment = Buffer.from(JSON.stringify({ sub: userId, iat, exp })).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest('base64url');

  return {
    token: `${headerSegment}.${payloadSegment}.${signature}`,
    expiresAt: new Date(exp * 1000),
    iat,
    exp,
  };
}

export function verifyAccessToken(
  token: string,
  secret: string,
  now: () => number = Date.now
): VerifiedToken {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new TokenError('Token is required.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new TokenError('Malformed token.');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeSegment(headerSegment, 'header');
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new TokenError('Unsupported token header.');
  }

  const expected = createHmac('sha256', secret)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest();

  const provided = Buffer.from(signatureSegment, 'base64url');
  if (
    !BASE64URL.test(signatureSegment) ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new TokenError('Invalid token signature.');
  }

  const payload = decodeSegment(payloadSegment, 'payload');
  const sub = payload.sub;
  const exp = payload.exp;

  if (typeof sub !== 'string' || sub.trim() === '') {
    throw new TokenError('Token subject is invalid.');
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new TokenError('Token expiration is invalid.');
  }

  if (exp * 1000 <= now()) {
    throw new TokenError('Token has expired.');
  }

  if (payload.iat !== undefined && (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat))) {
    throw new TokenError('Token issued-at claim is invalid.');
  }

  return {
    sub,
    exp,
    ...(payload.iat !== undefined && typeof payload.iat === 'number' ? { iat: payload.iat } : {}),
  };
}
