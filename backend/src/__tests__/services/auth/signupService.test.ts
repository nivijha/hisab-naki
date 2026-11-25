import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertOtpHashSecretConfigured,
  createOtpCodeHash,
  createSignupService,
  maskPhone,
  resolveOtpHashSecret,
  type OtpDelivery,
  type SignupChallenge,
  type SignupRepository,
} from '../../../services/auth/signupService.js';
import { HttpError } from '../../../middleware/authenticate.js';

const SECRET = 'signup-tests-hash-secret-that-is-32-chars-minimum';
const PHONE = '+919876543210';
const NOW = new Date('2026-11-23T10:00:00.000Z');

class FakeSignupRepository implements SignupRepository {
  exists = false;
  challenge: SignupChallenge | null = null;
  userCreated = false;
  attempts = 0;

  async userExistsByPhone() { return this.exists || this.userCreated; }
  async createPendingSignup(input: { name: string; phone: string; passwordHash: string; codeHash: string; expiresAt: Date }) {
    if (this.challenge) throw { code: 'P2002' };
    this.challenge = { id: 'challenge-1', codeHash: input.codeHash, expiresAt: input.expiresAt, attempts: 0, signupName: input.name, signupPasswordHash: input.passwordHash };
  }
  async createReplacementChallenge(phone: string, codeHash: string, expiresAt: Date) {
    if (!this.challenge || this.userCreated) return false;
    this.challenge = { ...this.challenge, id: `challenge-${Date.now()}`, codeHash, expiresAt, attempts: 0 };
    return true;
  }
  async findActiveChallenge() { return this.challenge; }
  async recordFailedAttempt(challenge: SignupChallenge) {
    this.attempts += 1;
    if (this.challenge?.id === challenge.id) this.challenge = { ...this.challenge, attempts: this.challenge.attempts + 1 };
  }
  async expireChallenge(challengeId: string) {
    if (this.challenge?.id === challengeId) this.challenge = null;
  }
  async cleanupExpiredSignupSecrets() { return 0; }
  async consumeAndCreateUser(_phone: string, challenge: SignupChallenge, now: Date, maxAttempts: number) {
    if (!this.challenge || this.challenge.id !== challenge.id || challenge.expiresAt <= now || challenge.attempts >= maxAttempts) return false;
    this.userCreated = true;
    this.challenge = null;
    return true;
  }
}

class FakeOtpDelivery implements OtpDelivery {
  readonly sent: Array<{ phone: string; code: string; ttl: number }> = [];
  fail = false;
  async sendSignupCode(phone: string, code: string, ttl: number) {
    if (this.fail) throw new Error('private provider error');
    this.sent.push({ phone, code, ttl });
  }
}

function setup(options: { codes?: string[]; repository?: FakeSignupRepository; delivery?: FakeOtpDelivery } = {}) {
  const repository = options.repository ?? new FakeSignupRepository();
  const delivery = options.delivery ?? new FakeOtpDelivery();
  let clock = NOW;
  const codes = [...(options.codes ?? ['004201', '007777'])];
  const service = createSignupService({
    repository,
    delivery,
    hashSecret: SECRET,
    now: () => clock,
    generateCode: () => codes.shift() ?? '009999',
    passwordHasher: async password => `test-hash:${password}`,
  });
  return { service, repository, delivery, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

async function expectHttpError(promise: Promise<unknown>, status: number, message: RegExp) {
  await assert.rejects(promise, error => error instanceof HttpError && error.statusCode === status && message.test(error.message));
}

describe('signup service', () => {
  it('stores only an HMAC of the OTP and a password hash, then sends the code', async () => {
    const { service, repository, delivery } = setup();
    const result = await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    assert.deepEqual(result, { maskedPhone: `${'\u2022'.repeat(8)}3210`, expiresAt: new Date(NOW.getTime() + 600_000), verificationRequired: true });
    assert.equal(repository.challenge?.codeHash, createOtpCodeHash(PHONE, '004201', SECRET));
    assert.notEqual(repository.challenge?.codeHash, '004201');
    assert.equal(repository.challenge?.signupPasswordHash, 'test-hash:long-test-password');
    assert.equal(delivery.sent[0].code, '004201');
    assert.equal(JSON.stringify(result).includes('004201'), false);
  });

  it('returns a generic conflict for duplicate registered phones without sending OTP', async () => {
    const repository = new FakeSignupRepository(); repository.exists = true;
    const { service, delivery } = setup({ repository });
    await expectHttpError(service.register({ name: 'New Name', phone: PHONE, password: 'long-test-password' }), 409, /cannot be registered/);
    assert.equal(delivery.sent.length, 0);
  });

  it('does not overwrite an existing pending signup after a duplicate registration', async () => {
    const repository = new FakeSignupRepository(); repository.challenge = { id: 'old', codeHash: 'hash', expiresAt: new Date(NOW.getTime() + 60_000), attempts: 0, signupName: 'Original Name', signupPasswordHash: 'original-hash' };
    const { service, delivery } = setup({ repository });
    await expectHttpError(service.register({ name: 'Different Name', phone: PHONE, password: 'long-test-password' }), 409, /cannot be registered/);
    assert.equal(delivery.sent.length, 0);
  });

  it('rejects wrong codes and creates the account only after valid verification', async () => {
    const { service, repository, delivery } = setup();
    await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    await expectHttpError(service.verify(PHONE, '111111'), 400, /invalid or expired/);
    assert.equal(repository.userCreated, false);
    assert.equal(repository.attempts, 1);
    assert.deepEqual(await service.verify(PHONE, '004201'), { verified: true });
    assert.equal(repository.userCreated, true);
    await expectHttpError(service.verify(PHONE, '004201'), 400, /invalid or expired/);
    assert.equal(delivery.sent.length, 1);
  });

  it('expires a challenge after five invalid attempts', async () => {
    const { service, repository } = setup();
    await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    for (let index = 0; index < 5; index += 1) await expectHttpError(service.verify(PHONE, '111111'), 400, /invalid or expired/);
    assert.equal(repository.attempts, 5);
    assert.equal(repository.userCreated, false);
  });

  it('rejects expired codes and does not create an account', async () => {
    const { service, repository, advance } = setup();
    await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    advance(600_001);
    await expectHttpError(service.verify(PHONE, '004201'), 400, /invalid or expired/);
    assert.equal(repository.userCreated, false);
  });

  it('signup responses expose no plaintext OTP (register or resend)', async () => {
    const { service, delivery } = setup();
    const registered = await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    assert.equal(JSON.stringify(registered).includes('004201'), false);
    const resent = await service.resend(PHONE);
    assert.equal(JSON.stringify(resent).includes('007777'), false);
    assert.ok(delivery.sent.length >= 2, 'codes were delivered through the OTP delivery adapter');
  });

  it('resends without disclosing account existence and never includes the code in response', async () => {
    const repository = new FakeSignupRepository();
    const { service, delivery } = setup({ repository });
    const absent = await service.resend(PHONE);
    assert.equal(absent.message.includes(PHONE), false);
    assert.equal(delivery.sent.length, 0);
    await service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' });
    const resend = await service.resend(PHONE);
    assert.deepEqual(resend, absent);
    assert.equal(delivery.sent.length, 2);
    assert.equal(repository.challenge?.codeHash, createOtpCodeHash(PHONE, '009999', SECRET));
  });

  it('keeps a pending signup recoverable when OTP delivery fails without leaking provider details', async () => {
    const repository = new FakeSignupRepository(); const delivery = new FakeOtpDelivery(); delivery.fail = true;
    const { service } = setup({ repository, delivery });
    await expectHttpError(service.register({ name: 'Nivi Shopkeeper', phone: PHONE, password: 'long-test-password' }), 503, /verification code/);
    assert.ok(repository.challenge);
    assert.equal(repository.challenge?.signupPasswordHash, 'test-hash:long-test-password');
  });
});

describe('maskPhone', () => {
  it('masks a normal Indian number keeping only the last four digits', () => {
    const masked = maskPhone('9876543210');
    assert.ok(masked.endsWith('3210'));
    assert.strictEqual(masked.replace(/\D/g, ''), '3210');
  });

  it('masks +91 numbers with the country code stripped', () => {
    for (const phone of ['+919876543210', '91 9876543210']) {
      const masked = maskPhone(phone);
      assert.ok(masked.endsWith('3210'));
      assert.strictEqual(masked.replace(/\D/g, ''), '3210');
    }
  });

  it('masks numbers with spaces or separators between digits', () => {
    const masked = maskPhone('(987) 654-3210');
    assert.ok(masked.endsWith('3210'));
    assert.strictEqual(masked.replace(/\D/g, ''), '3210');
  });

  it('masks short numbers without exposing more than the final four digits', () => {
    assert.strictEqual(maskPhone('1234'), '1234');
    assert.strictEqual(maskPhone('12'), '12');
  });

  it('handles malformed or empty inputs safely', () => {
    assert.strictEqual(maskPhone(''), '');
    assert.strictEqual(maskPhone('   '), '');
    assert.strictEqual(maskPhone('---'), '');
  });

  it('never exposes more than the final four digits for any input', () => {
    for (const phone of ['+919876543210', '(98765) 43210', '9876543210', '12345', '9']) {
      const digits = maskPhone(phone).replace(/\D/g, '');
      assert.ok(digits.length <= 4, `expected at most four digits for ${phone}, got ${digits}`);
    }
  });
});

describe('OTP_HASH_SECRET configuration', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['NODE_ENV', 'OTP_HASH_SECRET', 'JWT_SECRET'] as const;

  function setEnv(values: Record<string, string | undefined>): void {
    for (const key of KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  it('rejects missing OTP_HASH_SECRET in production (no silent fallback)', () => {
    setEnv({ NODE_ENV: 'production', OTP_HASH_SECRET: undefined });
    assert.throws(() => assertOtpHashSecretConfigured(), /OTP_HASH_SECRET is required in production/);
  });

  it('rejects weak OTP_HASH_SECRET in production', () => {
    setEnv({ NODE_ENV: 'production', OTP_HASH_SECRET: 'short' });
    assert.throws(() => assertOtpHashSecretConfigured(), /OTP_HASH_SECRET must be at least 32 characters/);
    assert.throws(() => resolveOtpHashSecret(), /OTP_HASH_SECRET must be at least 32 characters/);
  });

  it('accepts a valid OTP_HASH_SECRET in production', () => {
    setEnv({ NODE_ENV: 'production', OTP_HASH_SECRET: 'a'.repeat(40) });
    assert.doesNotThrow(() => assertOtpHashSecretConfigured());
    assert.strictEqual(resolveOtpHashSecret(), 'a'.repeat(40));
  });

  it('keeps the JWT_SECRET fallback in development when OTP_HASH_SECRET is unset', () => {
    setEnv({ NODE_ENV: 'development', OTP_HASH_SECRET: undefined, JWT_SECRET: 'b'.repeat(40) });
    assert.doesNotThrow(() => assertOtpHashSecretConfigured());
    assert.strictEqual(resolveOtpHashSecret(), 'b'.repeat(40));
  });

  it('rejects a weak OTP_HASH_SECRET in development', () => {
    setEnv({ NODE_ENV: 'development', OTP_HASH_SECRET: 'weak' });
    assert.throws(() => resolveOtpHashSecret(), /OTP_HASH_SECRET must be at least 32 characters/);
  });
});
