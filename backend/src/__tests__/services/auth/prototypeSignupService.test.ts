import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrototypeSignupService,
  isPrototypeSignupEnabled,
  assertPrototypeSignupNotEnabledInProduction,
  type PrototypeSignupRepository,
  type PrototypeSignupUser,
} from '../../../services/auth/prototypeSignupService.js';
import { createAuthService } from '../../../services/auth/authService.js';
import { verifyAccessToken } from '../../../services/auth/tokenService.js';
import { HttpError } from '../../../middleware/authenticate.js';

const SECRET = 'prototype-signup-tests-hash-secret-32chars';
const PHONE = '9876543210';

type StoredUser = { id: string; name: string; email: string; phone: string | null; passwordHash: string; phoneVerifiedAt: Date | null };

class FakePrototypeSignupRepository implements PrototypeSignupRepository {
  readonly users: StoredUser[] = [];

  async createUser(input: { name: string; email: string; phone: string | null; passwordHash: string }): Promise<PrototypeSignupUser> {
    const emailConflict = this.users.find((user) => user.email === input.email);
    if (emailConflict) {
      const err = new Error('Unique constraint failed') as Error & { code: string; meta: { target: string[] } };
      err.code = 'P2002';
      err.meta = { target: ['email'] };
      throw err;
    }
    const phoneConflict = input.phone ? this.users.find((user) => user.phone === input.phone) : null;
    if (phoneConflict) {
      const err = new Error('Unique constraint failed') as Error & { code: string; meta: { target: string[] } };
      err.code = 'P2002';
      err.meta = { target: ['phone'] };
      throw err;
    }
    const user: StoredUser = {
      id: `user-${this.users.length + 1}`,
      ...input,
      phoneVerifiedAt: null,
    };
    this.users.push(user);
    return { id: user.id, name: user.name, email: user.email, phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt };
  }
}

const SAVED_ENV_KEYS = ['NODE_ENV', 'PROTOTYPE_SIGNUP_ENABLED', 'JWT_SECRET'] as const;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of SAVED_ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('prototype signup configuration', () => {
  beforeEach(() => {
    for (const key of SAVED_ENV_KEYS) savedEnv[key] = process.env[key];
    setEnv({});
  });
  afterEach(() => setEnv(savedEnv));

  it('isPrototypeSignupEnabled is true only for explicit true or 1', () => {
    setEnv({ PROTOTYPE_SIGNUP_ENABLED: undefined });
    assert.strictEqual(isPrototypeSignupEnabled(), false);
    setEnv({ PROTOTYPE_SIGNUP_ENABLED: 'true' });
    assert.strictEqual(isPrototypeSignupEnabled(), true);
    setEnv({ PROTOTYPE_SIGNUP_ENABLED: '1' });
    assert.strictEqual(isPrototypeSignupEnabled(), true);
    setEnv({ PROTOTYPE_SIGNUP_ENABLED: 'false' });
    assert.strictEqual(isPrototypeSignupEnabled(), false);
  });

  it('rejects prototype signup at startup when enabled in production', () => {
    setEnv({ NODE_ENV: 'production', PROTOTYPE_SIGNUP_ENABLED: 'true' });
    assert.throws(() => assertPrototypeSignupNotEnabledInProduction(), /PROTOTYPE_SIGNUP_ENABLED cannot be used in production/);
  });

  it('allows prototype signup when enabled in development', () => {
    setEnv({ NODE_ENV: 'development', PROTOTYPE_SIGNUP_ENABLED: 'true' });
    assert.doesNotThrow(() => assertPrototypeSignupNotEnabledInProduction());
  });
});

describe('prototype signup service (email + password)', () => {
  beforeEach(() => setEnv({ NODE_ENV: 'development', PROTOTYPE_SIGNUP_ENABLED: 'true', JWT_SECRET: SECRET }));
  afterEach(() => setEnv({}));

  const SIGNUP_INPUT = {
    name: 'Nivi Shopkeeper',
    email: 'test@example.com',
    phone: PHONE,
    password: 'long-test-password',
  };

  it('registers a user with a session-compatible token and user info', async () => {
    const repository = new FakePrototypeSignupRepository();
    const service = createPrototypeSignupService(repository);

    const result = await service.register(SIGNUP_INPUT);

    assert.strictEqual(result.tokenType, 'Bearer');
    assert.strictEqual(typeof result.token, 'string');
    assert.strictEqual(result.token.split('.').length, 3);
    assert.ok(result.expiresAt instanceof Date);
    assert.strictEqual(typeof result.expiresIn, 'number');
    assert.strictEqual(result.user.id, repository.users[0].id);
    assert.strictEqual(result.user.name, 'Nivi Shopkeeper');
    assert.strictEqual(result.user.email, 'test@example.com');
    assert.strictEqual(result.user.phone, '+919876543210');
    assert.strictEqual(result.user.phoneVerifiedAt, null, 'MVP prototype signup leaves the phone unverified until OTP');
  });

  it('normalizes the email to lowercase for storage and duplicate checks', async () => {
    const repository = new FakePrototypeSignupRepository();
    const service = createPrototypeSignupService(repository);

    await service.register({ ...SIGNUP_INPUT, email: 'Test@Example.COM' });
    assert.strictEqual(repository.users[0].email, 'test@example.com');

    await assert.rejects(
      () => service.register({ ...SIGNUP_INPUT, email: 'TEST@example.com' }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 409);
        return true;
      }
    );
  });

  it('rejects a duplicate email with a message asking the user to log in', async () => {
    const repository = new FakePrototypeSignupRepository();
    repository.users.push({ id: 'existing', name: 'Other', email: 'test@example.com', phone: null, passwordHash: 'hash', phoneVerifiedAt: null });
    const service = createPrototypeSignupService(repository);

    await assert.rejects(
      () => service.register(SIGNUP_INPUT),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /already registered/i);
        assert.match(error.message, /sign in/i);
        return true;
      }
    );
  });

  it('rejects a duplicate phone with a 409 on P2002', async () => {
    const repository = new FakePrototypeSignupRepository();
    repository.users.push({ id: 'existing', name: 'Other', email: 'other@example.com', phone: '+919876543210', passwordHash: 'hash', phoneVerifiedAt: null });
    const service = createPrototypeSignupService(repository);

    await assert.rejects(
      () => service.register(SIGNUP_INPUT),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /already registered/i);
        return true;
      }
    );
  });

  it('rejects invalid input (blank name, invalid email, or short password)', async () => {
    const repository = new FakePrototypeSignupRepository();
    const service = createPrototypeSignupService(repository);

    await assert.rejects(() => service.register({ ...SIGNUP_INPUT, name: '   ' }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    await assert.rejects(() => service.register({ ...SIGNUP_INPUT, email: 'not-an-email' }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    await assert.rejects(() => service.register({ ...SIGNUP_INPUT, email: '   ' }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    await assert.rejects(() => service.register({ ...SIGNUP_INPUT, password: 'short' }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    assert.strictEqual(repository.users.length, 0, 'no user is created for invalid input');
  });

  it('never returns the stored password hash', async () => {
    const repository = new FakePrototypeSignupRepository();
    const service = createPrototypeSignupService(repository);
    const result = await service.register(SIGNUP_INPUT);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(repository.users[0].passwordHash), 'password hash must not be exposed');
    assert.ok(!serialized.includes('long-test-password'), 'plaintext password must not be exposed');
  });

  it('returns a token that authenticates login with the same credentials', async () => {
    const repository = new FakePrototypeSignupRepository();
    const service = createPrototypeSignupService(repository);
    const registered = await service.register(SIGNUP_INPUT);

    const loginService = createAuthService({
      userLookup: {
        findByIdentifier: async () => ({ id: repository.users[0].id, passwordHash: repository.users[0].passwordHash }),
      },
      secret: SECRET,
    });
    const loginResult = await loginService.login('test@example.com', 'long-test-password');

    assert.strictEqual(loginResult.tokenType, 'Bearer');
    const verified = verifyAccessToken(registered.token, SECRET);
    assert.strictEqual(verified.sub, repository.users[0].id);
    assert.ok(loginResult.token);
  });
});
