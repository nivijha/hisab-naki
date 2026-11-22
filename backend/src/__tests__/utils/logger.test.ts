import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logger } from '../../utils/logger.js';

describe('logger', () => {
  it('redacts sensitive fields from structured logs', () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      logger.info('test.event', {
        password: 'super-secret',
        passwordHash: 'hash',
        token: 'jwt',
        phone: '9999999999',
        businessId: 'biz-1',
      });
    } finally {
      process.stdout.write = original;
    }

    const output = lines.join('');
    assert.ok(output.includes('biz-1'));
    assert.ok(!output.includes('super-secret'));
    assert.ok(!output.includes('jwt'));
    assert.ok(!output.includes('9999999999'));
  });
});
