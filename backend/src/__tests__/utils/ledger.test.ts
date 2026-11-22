import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateOutstandingAmount,
  formatCurrency,
  toCurrencyText,
} from '../../utils/ledger.js';

describe('ledger utility - calculateOutstandingAmount', () => {
  it('returns 0 for empty transactions', () => {
    assert.strictEqual(calculateOutstandingAmount([]), 0);
  });

  it('adds one CREDIT transaction', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'CREDIT', amount: 450 },
      ]),
      450,
    );
  });

  it('subtracts one PAYMENT transaction', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'PAYMENT', amount: 200 },
      ]),
      -200,
    );
  });

  it('adds multiple CREDIT transactions', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'CREDIT', amount: 100 },
        { type: 'CREDIT', amount: 200 },
      ]),
      300,
    );
  });

  it('subtracts multiple PAYMENT transactions', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'PAYMENT', amount: 100 },
        { type: 'PAYMENT', amount: 150 },
      ]),
      -250,
    );
  });

  it('combines multiple CREDIT and PAYMENT transactions', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'CREDIT', amount: 100 },
        { type: 'CREDIT', amount: 200 },
        { type: 'PAYMENT', amount: 50 },
      ]),
      250,
    );
  });

  it('SALE transaction does not affect outstanding', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'SALE', amount: 1000 },
      ]),
      0,
    );
  });

  it('EXPENSE transaction does not affect outstanding', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'EXPENSE', amount: 500 },
      ]),
      0,
    );
  });

  it('mixed CREDIT, PAYMENT, SALE, and EXPENSE transactions ignore SALE and EXPENSE', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'CREDIT', amount: 450 },
        { type: 'PAYMENT', amount: 200 },
        { type: 'SALE', amount: 1000 },
        { type: 'EXPENSE', amount: 500 },
      ]),
      250,
    );
  });

  it('payment exceeding credit results in negative outstanding', () => {
    assert.strictEqual(
      calculateOutstandingAmount([
        { type: 'CREDIT', amount: 100 },
        { type: 'PAYMENT', amount: 300 },
      ]),
      -200,
    );
  });
});

describe('ledger utility - formatCurrency', () => {
  it('formats amount as INR currency', () => {
    const result = formatCurrency(450);
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.includes('450'));
    assert.ok(result.includes('₹') || result.includes('INR') || result.includes('Rs'));
  });

  it('formats zero amount', () => {
    const result = formatCurrency(0);
    assert.strictEqual(typeof result, 'string');
  });
});

describe('ledger utility - toCurrencyText', () => {
  it('returns rupee symbol with amount', () => {
    assert.strictEqual(toCurrencyText(450), '₹450');
  });

  it('uses Indian grouping for thousands', () => {
    assert.strictEqual(toCurrencyText(100000), '₹1,00,000');
  });

  it('handles zero', () => {
    assert.strictEqual(toCurrencyText(0), '₹0');
  });
});
