import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTransactionSchema } from '../../schemas/transaction.js';

function expectValid(input: unknown) {
  const result = createTransactionSchema.safeParse(input);
  assert.strictEqual(result.success, true, JSON.stringify(result.success ? {} : result.error.issues));
  return result.success ? result.data : null;
}

function expectInvalidAt(input: unknown, path?: string) {
  const result = createTransactionSchema.safeParse(input);
  assert.strictEqual(result.success, false);
  if (!result.success && path) {
    assert.ok(
      result.error.issues.some((issue) => issue.path.join('.') === path),
      `Expected an error at "${path}", got ${JSON.stringify(result.error.issues)}`
    );
  }
}

describe('createTransactionSchema - conditional fields', () => {
  it('accepts CREDIT with a customer name or customer ID', () => {
    expectValid({ type: 'CREDIT', customerName: 'Raju', amount: 450 });
    expectValid({ type: 'CREDIT', customerId: 'c-1', amount: 450 });
  });

  it('requires a customer for CREDIT', () => {
    expectInvalidAt({ type: 'CREDIT', amount: 450 }, 'customerName');
  });

  it('requires paymentMethod for PAYMENT', () => {
    expectValid({
      type: 'PAYMENT',
      customerName: 'Raju',
      amount: 200,
      paymentMethod: 'CASH',
    });
    expectInvalidAt({ type: 'PAYMENT', customerName: 'Raju', amount: 200 }, 'paymentMethod');
  });

  it('requires saleMode for SALE and paymentMethod only for cash sales', () => {
    expectValid({
      type: 'SALE',
      amount: 1000,
      saleMode: 'CASH',
      paymentMethod: 'UPI',
    });
    expectInvalidAt({ type: 'SALE', amount: 1000, paymentMethod: 'CASH' }, 'saleMode');
    expectInvalidAt({ type: 'SALE', amount: 1000, saleMode: 'CASH' }, 'paymentMethod');
  });

  it('requires a customer and forbids paymentMethod for credit sales', () => {
    expectValid({
      type: 'SALE',
      customerName: 'Raju',
      amount: 1000,
      saleMode: 'CREDIT',
    });
    expectInvalidAt(
      { type: 'SALE', amount: 1000, saleMode: 'CREDIT' },
      'customerName'
    );
    expectInvalidAt(
      {
        type: 'SALE',
        customerName: 'Raju',
        amount: 1000,
        saleMode: 'CREDIT',
        paymentMethod: 'CASH',
      },
      'paymentMethod'
    );
  });

  it('accepts EXPENSE only without a customer and with a payment method', () => {
    expectValid({ type: 'EXPENSE', amount: 250, paymentMethod: 'BANK_TRANSFER' });
    expectInvalidAt(
      { type: 'EXPENSE', customerName: 'Raju', amount: 250, paymentMethod: 'CASH' },
      'customerName'
    );
    expectInvalidAt({ type: 'EXPENSE', amount: 250 }, 'paymentMethod');
  });

  it('rejects fields that do not belong to the selected type', () => {
    expectInvalidAt(
      { type: 'CREDIT', customerName: 'Raju', amount: 100, saleMode: 'CASH' },
      'saleMode'
    );
    expectInvalidAt(
      { type: 'CREDIT', customerName: 'Raju', amount: 100, paymentMethod: 'CASH' },
      'paymentMethod'
    );
    expectInvalidAt(
      { type: 'PAYMENT', customerName: 'Raju', amount: 100, paymentMethod: 'CASH', saleMode: 'CASH' },
      'saleMode'
    );
  });

  it('rejects opening-balance and linked transaction fields', () => {
    expectInvalidAt(
      {
        type: 'CREDIT',
        customerName: 'Raju',
        amount: 100,
        openingDirection: 'INCREASE',
      },
      'openingDirection'
    );
    expectInvalidAt(
      {
        type: 'CREDIT',
        customerName: 'Raju',
        amount: 100,
        originalTransactionId: 'tx-original',
      },
      'originalTransactionId'
    );
  });

  it('infers the write type from a write intent', () => {
    expectValid({
      intent: 'ADD_SALE',
      amount: 1000,
      saleMode: 'CASH',
      paymentMethod: 'CASH',
    });
  });

  it('keeps read intents free of write requirements', () => {
    expectValid({ intent: 'GET_TOTAL_OUTSTANDING' });
  });

  it('rejects unsupported amount precision', () => {
    expectInvalidAt(
      { type: 'CREDIT', customerName: 'Raju', amount: 100.555 },
      'amount'
    );
  });

  it('rejects truly unknown transaction types', () => {
    expectInvalidAt({ type: 'VOID', amount: 100 }, 'type');
    expectInvalidAt({ type: 'WITHDRAWAL', amount: 100 }, 'type');
  });

  it('accepts OPENING_BALANCE with an INCREASE or DECREASE direction', () => {
    expectValid({ type: 'OPENING_BALANCE', customerName: 'Raju', openingDirection: 'INCREASE', amount: 100 });
    expectValid({ type: 'OPENING_BALANCE', customerId: 'c-1', openingDirection: 'DECREASE', amount: 100 });
    expectInvalidAt({ type: 'OPENING_BALANCE', amount: 100 }, 'customerName');
    expectInvalidAt({ type: 'OPENING_BALANCE', customerName: 'Raju', amount: 100 }, 'openingDirection');
    expectInvalidAt(
      { type: 'OPENING_BALANCE', customerName: 'Raju', openingDirection: 'UP', amount: 100 },
      'openingDirection'
    );
    expectInvalidAt({ type: 'OPENING_BALANCE', customerName: 'Raju', openingDirection: 'INCREASE', amount: 100, paymentMethod: 'CASH' }, 'paymentMethod');
  });

  it('rejects openingDirection on non-OPENING_BALANCE types', () => {
    expectInvalidAt({ type: 'CREDIT', customerName: 'Raju', amount: 100, openingDirection: 'INCREASE' }, 'openingDirection');
    expectInvalidAt({ type: 'SALE', amount: 100, saleMode: 'CASH', paymentMethod: 'CASH', openingDirection: 'DECREASE' }, 'openingDirection');
  });

  it('accepts SALE_RETURN with a customer and rejects it without one', () => {
    expectValid({ type: 'SALE_RETURN', customerName: 'Raju', amount: 100 });
    expectValid({ type: 'SALE_RETURN', customerId: 'c-1', amount: 100 });
    expectInvalidAt({ type: 'SALE_RETURN', amount: 100 }, 'customerName');
    expectInvalidAt({ type: 'SALE_RETURN', customerName: 'Raju', amount: 100, paymentMethod: 'CASH' }, 'paymentMethod');
    expectInvalidAt({ type: 'SALE_RETURN', customerName: 'Raju', amount: 100, saleMode: 'CASH' }, 'saleMode');
  });

  it('accepts REFUND with or without a customer, but not with payment fields', () => {
    expectValid({ type: 'REFUND', customerName: 'Raju', amount: 100 });
    expectValid({ type: 'REFUND', amount: 100 });
    expectInvalidAt({ type: 'REFUND', customerName: 'Raju', amount: 100, paymentMethod: 'CASH' }, 'paymentMethod');
    expectInvalidAt({ type: 'REFUND', amount: 100, saleMode: 'CASH' }, 'saleMode');
  });

  it('rejects saleMode on every non-SALE type', () => {
    expectInvalidAt({ type: 'CREDIT', customerName: 'Raju', amount: 100, saleMode: 'CASH' }, 'saleMode');
    expectInvalidAt({ type: 'EXPENSE', amount: 100, paymentMethod: 'CASH', saleMode: 'CASH' }, 'saleMode');
    expectInvalidAt({ type: 'OPENING_BALANCE', openingDirection: 'INCREASE', amount: 100, saleMode: 'CASH' }, 'saleMode');
    expectInvalidAt({ type: 'SALE_RETURN', customerName: 'Raju', amount: 100, saleMode: 'CASH' }, 'saleMode');
    expectInvalidAt({ type: 'REFUND', amount: 100, saleMode: 'CASH' }, 'saleMode');
  });

  it('strips spoofed tenant fields from the parsed body', () => {
    const data = expectValid({
      type: 'CREDIT',
      customerName: 'Raju',
      amount: 100,
      businessId: 'biz-2',
      createdByUserId: 'attacker',
    });
    assert.ok(data);
    assert.ok(!('businessId' in data));
    assert.ok(!('createdByUserId' in data));
  });

  it('reports field-level issues for invalid input', () => {
    const result = createTransactionSchema.safeParse({ type: 'PAYMENT', amount: 100 });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.issues.length > 0);
      assert.ok(result.error.issues.every((issue) => issue.path.length > 0));
    }
  });
});
