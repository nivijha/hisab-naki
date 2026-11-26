import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeSignupSchema } from '../../schemas/auth.js';

describe('prototypeSignupSchema', () => {
  it('accepts name, email, optional phone and password', () => {
    const result = prototypeSignupSchema.safeParse({
      name: 'Nivi Shopkeeper',
      email: 'nivi@example.com',
      phone: '9876543210',
      password: 'long-test-password',
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.name, 'Nivi Shopkeeper');
      assert.strictEqual(result.data.email, 'nivi@example.com');
      assert.strictEqual(result.data.phone, '+919876543210');
    }

    const withoutPhone = prototypeSignupSchema.safeParse({
      name: 'Nivi Shopkeeper', email: 'nivi@example.com', password: 'long-test-password',
    });
    assert.strictEqual(withoutPhone.success, true);
    if (withoutPhone.success) assert.strictEqual(withoutPhone.data.phone, undefined);
  });

  it('trims the name and email', () => {
    const result = prototypeSignupSchema.safeParse({
      name: '  Nivi Shopkeeper  ', email: ' nivi@example.com ', password: 'long-test-password',
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.name, 'Nivi Shopkeeper');
      assert.strictEqual(result.data.email, 'nivi@example.com');
    }
  });

  it('rejects a weak password', () => {
    const result = prototypeSignupSchema.safeParse({ name: 'Nivi', email: 'nivi@example.com', password: 'short' });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'password'));
    }
  });

  it('rejects blank or missing names and invalid emails', () => {
    assert.strictEqual(prototypeSignupSchema.safeParse({ name: '  ', email: 'nivi@example.com', password: 'long-password' }).success, false);
    assert.strictEqual(prototypeSignupSchema.safeParse({ email: 'nivi@example.com', password: 'long-password' }).success, false);
    assert.strictEqual(prototypeSignupSchema.safeParse({ name: 'Nivi', email: 'not-an-email', password: 'long-password' }).success, false);
    const invalidEmail = prototypeSignupSchema.safeParse({ name: 'Nivi', email: 'bad', password: 'long-password' });
    assert.strictEqual(invalidEmail.success, false);
    if (!invalidEmail.success) {
      assert.ok(invalidEmail.error.issues.some((issue) => issue.path.join('.') === 'email'));
    }
  });

  it('rejects malformed phones when provided, treats empty as omitted', () => {
    const invalid = prototypeSignupSchema.safeParse({ name: 'Nivi', email: 'nivi@example.com', phone: 'abc', password: 'long-password' });
    assert.strictEqual(invalid.success, false);
    if (!invalid.success) {
      assert.ok(invalid.error.issues.some((issue) => issue.path.join('.') === 'phone'));
    }
    const empty = prototypeSignupSchema.safeParse({ name: 'Nivi', email: 'nivi@example.com', phone: '', password: 'long-password' });
    assert.strictEqual(empty.success, true);
    if (empty.success) assert.equal(empty.data.phone, undefined);
  });

  it('is strict about unknown fields', () => {
    const result = prototypeSignupSchema.safeParse({
      name: 'Nivi', email: 'nivi@example.com', password: 'long-password', businessName: 'My Shop',
    });
    assert.strictEqual(result.success, false);
  });
});
