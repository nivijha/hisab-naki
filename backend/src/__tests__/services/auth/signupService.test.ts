import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOtpCodeHash, createSignupService, PrismaSignupRepository, type OtpDelivery, type SignupChallenge, type SignupRepository } from '../../../services/auth/signupService.js';
import type { PrismaClient } from '@prisma/client';
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
    assert.deepEqual(result, { maskedPhone: '•••••••••3210', expiresAt: new Date(NOW.getTime() + 600_000), verificationRequired: true });
    assert.equal(repository.challenge?.codeHash, createOtpCodeHash(PHONE, '004201', SECRET));
    assert.notEqual(repository.challenge?.codeHash, '004201');
    assert.equal(repository.challenge?.signupPasswordHash, 'test-hash:long-test-password');
    assert.equal(repository.userCreated, false);
    assert.ok(repository.challenge, 'registration must leave a pending challenge before verification');
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

  it('serializes concurrent registration attempts and sends only one code', async () => {
    const repository = new FakeSignupRepository();
    const { service, delivery } = setup({ repository });
    const attempts = await Promise.allSettled([
      service.register({ name: 'First Shopkeeper', phone: PHONE, password: 'long-test-password' }),
      service.register({ name: 'Second Shopkeeper', phone: PHONE, password: 'another-long-password' }),
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
    assert.equal(repository.userCreated, false);
    assert.ok(repository.challenge);
    assert.equal(delivery.sent.length, 1);
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

describe('Prisma signup advisory locks', () => {
  function makeClient(options: { failInsert?: boolean } = {}) {
    const committedStatements: string[] = [];
    const client = {
      user: { findUnique: async () => null },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        const transactionStatements: string[] = [];
        const tx = {
          $queryRaw: async (strings: TemplateStringsArray) => {
            const sql = strings.join('?');
            if (sql.includes('pg_advisory_xact_lock')) {
              const error = new Error('Failed to deserialize column of type void') as Error & { code?: string };
              error.name = 'PrismaClientKnownRequestError';
              error.code = 'P2010';
              throw error;
            }
            if (sql.includes('FROM "OtpChallenge"')) return [];
            throw new Error('Unexpected raw query in test');
          },
          $executeRaw: async (strings: TemplateStringsArray) => {
            const sql = strings.join('?');
            transactionStatements.push(sql);
            if (options.failInsert && sql.includes('INSERT INTO "OtpChallenge"')) throw new Error('simulated insert failure');
            return 1;
          },
        };
        const result = await operation(tx);
        committedStatements.push(...transactionStatements);
        return result;
      },
    } as unknown as PrismaClient;
    return { client, committedStatements };
  }

  it('executes the void-returning lock without Prisma result deserialization', async () => {
    const { client, committedStatements } = makeClient();
    const repository = new PrismaSignupRepository(client);
    await repository.createPendingSignup({ name: 'Nivi', phone: PHONE, passwordHash: 'password-hash', codeHash: 'code-hash', expiresAt: NOW });
    assert.equal(committedStatements.filter(sql => sql.includes('pg_advisory_xact_lock')).length, 1);
    assert.equal(committedStatements.filter(sql => sql.includes('INSERT INTO "OtpChallenge"')).length, 1);
  });

  it('uses the same transaction-scoped lock for resend and rolls back failed inserts', async () => {
    const resendClient = makeClient();
    const resendRepository = new PrismaSignupRepository(resendClient.client);
    await resendRepository.createReplacementChallenge(PHONE, 'next-code-hash', NOW);
    assert.equal(resendClient.committedStatements.filter(sql => sql.includes('pg_advisory_xact_lock')).length, 1);

    const failingClient = makeClient({ failInsert: true });
    const failingRepository = new PrismaSignupRepository(failingClient.client);
    await assert.rejects(failingRepository.createPendingSignup({ name: 'Nivi', phone: PHONE, passwordHash: 'password-hash', codeHash: 'code-hash', expiresAt: NOW }), /simulated insert failure/);
    assert.deepEqual(failingClient.committedStatements, []);
  });
});
