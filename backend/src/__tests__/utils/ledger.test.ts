import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import {
  calculateOutstandingAmount,
  formatCurrency,
  toCurrencyText,
} from '../../utils/ledger.js';

const d = (value: string | number) => new Prisma.Decimal(value);

describe('ledger utility - calculateOutstandingAmount', () => {
  it('1. CREDIT increases outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'CREDIT', amount: d(450) }]);
    assert.ok(result instanceof Prisma.Decimal);
    assert.strictEqual(result.toString(), '450');
  });

  it('2. PAYMENT decreases outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'PAYMENT', amount: d(200) }]);
    assert.strictEqual(result.toString(), '-200');
  });

  it('3. SALE does not affect outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'SALE', amount: d(1000) }]);
    assert.strictEqual(result.toString(), '0');
  });

  it('4. EXPENSE does not affect outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'EXPENSE', amount: d(500) }]);
    assert.strictEqual(result.toString(), '0');
  });

  it('5. multiple customers are combined with Decimal arithmetic', () => {
    const raju = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('450.00') },
      { type: 'PAYMENT', amount: d('200.00') },
    ]);
    const amit = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('700.50') },
      { type: 'PAYMENT', amount: d('300.25') },
    ]);

    assert.strictEqual(raju.toFixed(2), '250.00');
    assert.strictEqual(amit.toFixed(2), '400.25');
    assert.strictEqual(raju.plus(amit).toFixed(2), '650.25');
  });

  it('6. overpayment produces a negative balance', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(100) },
      { type: 'PAYMENT', amount: d(300) },
    ]);
    assert.strictEqual(result.toString(), '-200');
  });

  it('7. decimal amounts 100.50 and 25.25 are preserved exactly', () => {
    const credit = calculateOutstandingAmount([{ type: 'CREDIT', amount: d('100.50') }]);
    const payment = calculateOutstandingAmount([{ type: 'PAYMENT', amount: d('25.25') }]);

    assert.strictEqual(credit.toFixed(2), '100.50');
    assert.strictEqual(payment.toFixed(2), '-25.25');
  });

  it('8. mixed decimal credits and payments produce the exact balance', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('100.50') },
      { type: 'PAYMENT', amount: d('25.25') },
      { type: 'CREDIT', amount: d('0.75') },
      { type: 'SALE', amount: d('999.99') },
      { type: 'EXPENSE', amount: d('888.88') },
    ]);
    assert.strictEqual(result.toFixed(2), '76.00');
  });

  it('9. empty transactions produce zero as Decimal', () => {
    const result = calculateOutstandingAmount([]);
    assert.ok(result instanceof Prisma.Decimal);
    assert.strictEqual(result.toString(), '0');
  });

  it('10. existing integer-based behavior remains correct', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(100) },
      { type: 'CREDIT', amount: d(200) },
      { type: 'PAYMENT', amount: d(50) },
      { type: 'SALE', amount: d(1000) },
      { type: 'EXPENSE', amount: d(500) },
    ]);
    assert.strictEqual(result.toString(), '250');
  });

  it('accepts plain numeric amounts for backward compatibility', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: 100 },
      { type: 'PAYMENT', amount: 25.25 },
    ]);
    assert.strictEqual(result.toFixed(2), '74.75');
  });

  it('does not round away fractional precision', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('0.01') },
      { type: 'CREDIT', amount: d('0.02') },
    ]);
    assert.strictEqual(result.toFixed(2), '0.03');
    assert.strictEqual(result.toNumber(), 0.03);
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
