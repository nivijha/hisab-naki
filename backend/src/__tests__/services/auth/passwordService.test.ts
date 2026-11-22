import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword } from '../../../services/auth/passwordService.js';

describe('passwordService', () => {
  it('hashes a password into a salted scrypt string', async () => {
    const hash = await hashPassword('correct-password');
    assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(hash.split('$')[4].length > 0, 'salt present');
  });

  it('uses a different salt for every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    assert.notStrictEqual(a, b);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct-password');
    assert.strictEqual(await verifyPassword('correct-password', hash), true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-password');
    assert.strictEqual(await verifyPassword('wrong-password', hash), false);
  });

  it('returns false for malformed hashes', async () => {
    assert.strictEqual(await verifyPassword('pw', 'not-a-hash'), false);
    assert.strictEqual(await verifyPassword('pw', 'scrypt$abc$8$1$00$00'), false);
    assert.strictEqual(await verifyPassword('pw', ''), false);
  });

  it('rejects unsafe scrypt parameters instead of deriving a key', async () => {
    const salt = '00'.repeat(16);
    const key = '00'.repeat(64);
    const params: Array<[string, string, string]> = [
      ['16', '8', '1'],          // below minimum
      ['1048576', '8', '1'],     // above maximum
      ['20000', '8', '1'],       // not a power of two
      ['16384', '0', '1'],       // r too small
      ['16384', '64', '1'],      // r too large
      ['16384', '8', '0'],       // p too small
      ['16384', '8', '32'],      // p too large
      ['16384', '8', '1024'],    // excessive memory
    ];

    for (const [n, r, p] of params) {
      const hash = `scrypt$${n}$${r}$${p}$${salt}$${key}`;
      assert.strictEqual(await verifyPassword('pw', hash), false, `rejected ${n}/${r}/${p}`);
    }
  });
});
