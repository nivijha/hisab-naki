import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { HttpError } from '../../../middleware/authenticate.js';
import { assertTrustedOriginForCookieAuth, clearSessionCookie, getSessionCookieOptions, parseCookies, serializeCookie, SESSION_COOKIE_NAME, setSessionCookie } from '../../../services/auth/sessionCookie.js';

const envKeys = ['NODE_ENV', 'CORS_ORIGIN', 'SESSION_COOKIE_SECURE', 'SESSION_COOKIE_SAMESITE', 'SESSION_COOKIE_DOMAIN'] as const;
const saved: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<typeof envKeys[number], string | undefined>>) {
  for (const key of envKeys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function req(headers: Record<string, string>, method = 'POST'): Request {
  return { method, header: (name: string) => headers[name.toLowerCase()] } as Request;
}

describe('sessionCookie', () => {
  beforeEach(() => { for (const k of envKeys) saved[k] = process.env[k]; });
  afterEach(() => { setEnv(saved); });

  it('parses cookies safely', () => {
    assert.deepEqual(parseCookies('a=1; hisabnaki_session=abc.def.ghi; b=two'), { a: '1', hisabnaki_session: 'abc.def.ghi', b: 'two' });
  });

  it('builds secure httpOnly cookie options in production by default', () => {
    setEnv({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: undefined, SESSION_COOKIE_SAMESITE: 'lax', SESSION_COOKIE_DOMAIN: undefined });
    const opts = getSessionCookieOptions(3600);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.secure, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/');
    assert.equal(opts.maxAge, 3600000);
  });

  it('serializes and clears session cookie', () => {
    setEnv({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'true', SESSION_COOKIE_SAMESITE: 'strict', SESSION_COOKIE_DOMAIN: '.example.com' });
    const headers: string[] = [];
    const res = { append: (name: string, value: string) => { assert.equal(name, 'Set-Cookie'); headers.push(value); } } as any;
    setSessionCookie(res, 'token123', 60);
    clearSessionCookie(res);
    assert.match(headers[0], /^hisabnaki_session=token123; Path=\/; Max-Age=60; SameSite=Strict; Domain=\.example\.com; Secure; HttpOnly$/);
    assert.match(headers[1], /Max-Age=0/);
  });

  it('rejects cookie-authenticated state changes from untrusted origins', () => {
    setEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' });
    assert.throws(() => assertTrustedOriginForCookieAuth(req({ cookie: `${SESSION_COOKIE_NAME}=token`, origin: 'https://evil.example.com' })), (e: unknown) => e instanceof HttpError && e.statusCode === 403);
  });

  it('allows cookie-authenticated state changes from trusted origin', () => {
    setEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' });
    assert.doesNotThrow(() => assertTrustedOriginForCookieAuth(req({ cookie: `${SESSION_COOKIE_NAME}=token`, origin: 'https://app.example.com' })));
  });

  it('requires origin/referer for cookie-authenticated state changes', () => {
    setEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' });
    assert.throws(() => assertTrustedOriginForCookieAuth(req({ cookie: `${SESSION_COOKIE_NAME}=token` })), (e: unknown) => e instanceof HttpError && e.statusCode === 403);
  });

  it('does not enforce CSRF origin when no session cookie is present', () => {
    setEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' });
    assert.doesNotThrow(() => assertTrustedOriginForCookieAuth(req({ origin: 'https://evil.example.com' })));
  });
});
