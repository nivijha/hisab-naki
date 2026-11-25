import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../../middleware/authenticate.js';
import {
  HttpOtpDelivery,
  MockOtpDelivery,
  assertOtpDeliveryEnvironment,
  createOtpDelivery,
  resolveOtpDeliveryMode,
} from '../../../services/auth/otpDelivery.js';

const PHONE = '+919876543210';
const WATCHED_KEYS = [
  'NODE_ENV',
  'OTP_DELIVERY_MODE',
  'OTP_DELIVERY_URL',
  'OTP_DELIVERY_TOKEN',
  'OTP_DELIVERY_CHANNEL',
  'OTP_HASH_SECRET',
] as const;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of WATCHED_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  for (const key of WATCHED_KEYS) savedEnv[key] = process.env[key];
  setEnv({});
});

afterEach(() => {
  setEnv(savedEnv);
});

describe('resolveOtpDeliveryMode', () => {
  it('defaults to http when OTP_DELIVERY_MODE is missing or empty', () => {
    assert.strictEqual(resolveOtpDeliveryMode(), 'http');
    setEnv({ OTP_DELIVERY_MODE: '' });
    assert.strictEqual(resolveOtpDeliveryMode(), 'http');
  });

  it('accepts http and mock case-insensitively, trimming whitespace', () => {
    setEnv({ OTP_DELIVERY_MODE: '  HTTP  ' });
    assert.strictEqual(resolveOtpDeliveryMode(), 'http');
    setEnv({ OTP_DELIVERY_MODE: 'Mock' });
    assert.strictEqual(resolveOtpDeliveryMode(), 'mock');
  });

  it('throws on an invalid mode instead of silently selecting mock', () => {
    setEnv({ OTP_DELIVERY_MODE: 'smtp' });
    assert.throws(() => resolveOtpDeliveryMode(), /Invalid OTP_DELIVERY_MODE/);
  });
});

describe('MockOtpDelivery', () => {
  it('logs the OTP with the phone masked and no full phone number in output', () => {
    const chunks: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      new MockOtpDelivery().sendSignupCode('+919876543210', '482913', 600);
    } finally {
      process.stdout.write = originalWrite;
    }
    const output = chunks.join('');
    assert.match(output, /\[DEV OTP\]/);
    assert.match(output, /Phone: \u2022+3210/);
    assert.match(output, /Code: 482913/);
    assert.ok(!output.includes('+91987654321'), 'full phone number must not appear in the log');
  });
});

describe('assertOtpDeliveryEnvironment', () => {
  it('rejects mock mode in production', () => {
    setEnv({ NODE_ENV: 'production', OTP_DELIVERY_MODE: 'mock' });
    assert.throws(() => assertOtpDeliveryEnvironment(), /OTP_DELIVERY_MODE=mock is not allowed in production/);
  });

  it('accepts mock mode in development', () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'mock' });
    assert.doesNotThrow(() => assertOtpDeliveryEnvironment());
  });

  it('accepts http mode in production', () => {
    setEnv({ NODE_ENV: 'production', OTP_DELIVERY_MODE: 'http' });
    assert.doesNotThrow(() => assertOtpDeliveryEnvironment());
  });

  it('validates the mode in development too', () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'pigeon' });
    assert.throws(() => assertOtpDeliveryEnvironment(), /Invalid OTP_DELIVERY_MODE/);
  });
});

describe('createOtpDelivery', () => {
  it('returns MockOtpDelivery in development with mode mock', () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'mock' });
    assert.ok(createOtpDelivery() instanceof MockOtpDelivery);
  });

  it('throws when mock is selected outside development instead of silently falling back', () => {
    setEnv({ NODE_ENV: 'production', OTP_DELIVERY_MODE: 'mock' });
    assert.throws(() => createOtpDelivery(), /NODE_ENV=development/);
    setEnv({ NODE_ENV: 'test', OTP_DELIVERY_MODE: 'mock' });
    assert.throws(() => createOtpDelivery(), /NODE_ENV=development/);
  });

  it('returns HttpOtpDelivery when mode is missing or http', () => {
    setEnv({ NODE_ENV: 'development' });
    assert.ok(createOtpDelivery() instanceof HttpOtpDelivery);
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http' });
    assert.ok(createOtpDelivery() instanceof HttpOtpDelivery);
  });
});

describe('HttpOtpDelivery', () => {
  function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
    const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? '') });
      return handler(url, init);
    }) as typeof fetch;
    return { sent, restore: () => { globalThis.fetch = originalFetch; } };
  }

  it('returns a generic 503 when delivery is not configured', async () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http' });
    await assert.rejects(
      () => new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600),
      (error: unknown) =>
        error instanceof HttpError && error.statusCode === 503 && /not configured/.test(error.message)
    );
  });

  it('returns a generic 503 for an invalid endpoint URL', async () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http', OTP_DELIVERY_URL: 'not a url', OTP_DELIVERY_TOKEN: 'token' });
    await assert.rejects(
      () => new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600),
      (error: unknown) => error instanceof HttpError && error.statusCode === 503
    );
  });

  it('returns a generic 503 in production for a non-HTTPS endpoint', async () => {
    setEnv({ NODE_ENV: 'production', OTP_DELIVERY_MODE: 'http', OTP_DELIVERY_URL: 'http://example.com/otp', OTP_DELIVERY_TOKEN: 'token' });
    await assert.rejects(
      () => new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600),
      (error: unknown) => error instanceof HttpError && error.statusCode === 503 && /must use HTTPS/.test(error.message)
    );
  });

  it('returns a generic 503 when the provider returns a non-OK response', async () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http', OTP_DELIVERY_URL: 'https://example.com/otp', OTP_DELIVERY_TOKEN: 'token' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    try {
      await assert.rejects(
        () => new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600),
        (error: unknown) =>
          error instanceof HttpError && error.statusCode === 503 && /temporarily unavailable/.test(error.message)
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a generic 503 when the fetch rejects (simulated timeout)', async () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http', OTP_DELIVERY_URL: 'https://example.com/otp', OTP_DELIVERY_TOKEN: 'token' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('The operation was aborted (timeout)');
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600),
        (error: unknown) =>
          error instanceof HttpError && error.statusCode === 503 && /temporarily unavailable/.test(error.message)
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sends the code to the configured endpoint without logging credentials or the OTP', async () => {
    setEnv({ NODE_ENV: 'development', OTP_DELIVERY_MODE: 'http', OTP_DELIVERY_URL: 'https://example.com/otp', OTP_DELIVERY_TOKEN: 'test-token-123' });
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const { sent, restore } = stubFetch(() => new Response('{}', { status: 200 }));
    try {
      await new HttpOtpDelivery().sendSignupCode(PHONE, '482913', 600);
    } finally {
      process.stdout.write = originalWrite;
      restore();
    }
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].url, /https:\/\/example\.com\/otp/);
    assert.strictEqual(sent[0].headers['Authorization'], 'Bearer test-token-123');
    assert.match(sent[0].body, /482913/);
    const log = output.join('');
    assert.ok(log.length === 0 || (!log.includes('482913') && !log.includes('test-token-123')));
  });
});
