import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessSchema, registerSchema, resendSignupCodeSchema, verifySignupCodeSchema } from '../../schemas/signup.js';

describe('signup and onboarding schemas', () => {
  it('normalizes ten-digit Indian mobile numbers and preserves Unicode names', () => {
    const parsed = registerSchema.parse({ name: '  नवी दुकान  ', phone: '98765 43210', password: 'a-long-password' });
    assert.deepEqual(parsed, { name: 'नवी दुकान', phone: '+919876543210', password: 'a-long-password' });
  });

  it('accepts international E.164 phones and rejects invalid phone, weak password, and unknown fields', () => {
    assert.equal(registerSchema.parse({ name: 'A Shop', phone: '+14155552671', password: '12345678' }).phone, '+14155552671');
    assert.equal(registerSchema.safeParse({ name: 'A Shop', phone: '123', password: '12345678' }).success, false);
    assert.equal(registerSchema.safeParse({ name: 'A Shop', phone: '9876543210', password: 'short' }).success, false);
    assert.equal(registerSchema.safeParse({ name: 'A Shop', phone: '9876543210', password: '12345678', email: 'unverified@example.com' }).success, false);
  });

  it('validates resend and six-digit verification inputs', () => {
    assert.equal(resendSignupCodeSchema.parse({ phone: '9876543210' }).phone, '+919876543210');
    assert.equal(verifySignupCodeSchema.safeParse({ phone: '9876543210', code: '000001' }).success, true);
    assert.equal(verifySignupCodeSchema.safeParse({ phone: '9876543210', code: '1234' }).success, false);
  });

  it('requires a meaningful shop name', () => {
    assert.equal(createBusinessSchema.parse({ name: '  Nivi Kirana ' }).name, 'Nivi Kirana');
    assert.equal(createBusinessSchema.safeParse({ name: ' ' }).success, false);
  });
});
