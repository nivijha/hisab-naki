import type { Request, Response } from 'express';
import { HttpError } from '../../middleware/authenticate.js';

export const SESSION_COOKIE_NAME = 'hisabnaki_session';

export type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  domain?: string;
  path: string;
  maxAge: number;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} must be true or false.`);
}

export function getSessionCookieSameSite(): 'lax' | 'strict' | 'none' {
  const raw = process.env.SESSION_COOKIE_SAMESITE?.trim().toLowerCase();
  const sameSite = raw === 'strict' ? 'strict' : raw === 'none' ? 'none' : 'lax';
  if (sameSite === 'none' && !getSessionCookieSecure()) {
    throw new Error('SESSION_COOKIE_SAMESITE=none requires Secure cookies.');
  }
  return sameSite;
}

export function getSessionCookieSecure(): boolean {
  return parseBooleanEnv('SESSION_COOKIE_SECURE', isProduction());
}

export function getSessionCookieDomain(): string | undefined {
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  return domain ? domain : undefined;
}

export function getSessionCookieOptions(maxAgeSeconds: number): SessionCookieOptions {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return {
    httpOnly: true,
    secure: getSessionCookieSecure(),
    sameSite: getSessionCookieSameSite(),
    domain: getSessionCookieDomain(),
    path: '/',
    maxAge: maxAge * 1000,
  };
}

export function serializeCookie(name: string, value: string, options: SessionCookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path}`);
  parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  parts.push(`SameSite=${options.sameSite === 'none' ? 'None' : options.sameSite === 'strict' ? 'Strict' : 'Lax'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.secure) parts.push('Secure');
  if (options.httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const rawValue = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

export function getCookieToken(req: Request): string | null {
  const cookies = parseCookies(req.header('cookie'));
  const token = cookies[SESSION_COOKIE_NAME];
  return typeof token === 'string' && token.trim() ? token : null;
}

export function setSessionCookie(res: Response, token: string, maxAgeSeconds: number): void {
  const options = getSessionCookieOptions(maxAgeSeconds);
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, token, options));
}

export function clearSessionCookie(res: Response): void {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, '', getSessionCookieOptions(0)));
}

export function getConfiguredFrontendOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

export function isTrustedOrigin(origin: string): boolean {
  const configured = getConfiguredFrontendOrigins();
  if (configured.length === 0) return false;
  if (configured.includes('*')) {
    return process.env.NODE_ENV !== 'production';
  }
  return configured.includes(origin);
}

export function assertTrustedOriginForCookieAuth(req: Request): void {
  if (!getCookieToken(req)) return;
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = req.header('origin')?.trim();
  if (origin) {
    if (!isTrustedOrigin(origin)) {
      throw new HttpError(403, 'Origin is not allowed for cookie-authenticated requests.');
    }
    return;
  }

  const referer = req.header('referer')?.trim();
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isTrustedOrigin(refererOrigin)) return;
    } catch {
      // Fall through to rejection.
    }
  }

  throw new HttpError(403, 'Origin is required for cookie-authenticated state-changing requests.');
}

export function resolveCorsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void): void {
  const configured = getConfiguredFrontendOrigins();
  if (configured.length === 0) {
    callback(null, process.env.NODE_ENV === 'production' ? false : true);
    return;
  }
  if (configured.includes('*')) {
    if (process.env.NODE_ENV === 'production') {
      callback(new Error('CORS_ORIGIN wildcard is not allowed in production.'));
      return;
    }
    callback(null, true);
    return;
  }
  if (!origin) {
    callback(null, false);
    return;
  }
  if (configured.includes(origin)) {
    callback(null, origin);
    return;
  }
  callback(null, false);
}
