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
  it('1. CREDIT only increases outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'CREDIT', amount: d(450) }]);
    assert.ok(result instanceof Prisma.Decimal);
    assert.strictEqual(result.toString(), '450');
  });

  it('2. PAYMENT only decreases outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'PAYMENT', amount: d(200) }]);
    assert.strictEqual(result.toString(), '-200');
  });

  it('3. CREDIT followed by PAYMENT nets correctly', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(500) },
      { type: 'PAYMENT', amount: d(200) },
    ]);
    assert.strictEqual(result.toString(), '300');
  });

  it('4. CREDIT SALE increases outstanding', () => {
    const result = calculateOutstandingAmount([
      { type: 'SALE', amount: d(1000), saleMode: 'CREDIT' },
    ]);
    assert.strictEqual(result.toString(), '1000');
  });

  it('5. CASH SALE does not affect outstanding', () => {
    const result = calculateOutstandingAmount([
      { type: 'SALE', amount: d(1000), saleMode: 'CASH' },
    ]);
    assert.strictEqual(result.toString(), '0');
  });

  it('6. EXPENSE does not affect customer outstanding', () => {
    const result = calculateOutstandingAmount([{ type: 'EXPENSE', amount: d(500) }]);
    assert.strictEqual(result.toString(), '0');
  });

  it('7. VOIDED transactions are excluded from every type', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(500), status: 'ACTIVE' },
      { type: 'CREDIT', amount: d(900), status: 'VOIDED' },
      { type: 'PAYMENT', amount: d(50), status: 'VOIDED' },
      { type: 'SALE', amount: d(100), saleMode: 'CREDIT', status: 'VOIDED' },
      { type: 'SALE', amount: d(1000), saleMode: 'CASH', status: 'ACTIVE' },
      { type: 'EXPENSE', amount: d(200), status: 'ACTIVE' },
      { type: 'SALE', amount: d(250), saleMode: 'CREDIT', status: 'ACTIVE' },
    ]);
    assert.strictEqual(result.toString(), '750');
  });

  it('8. all supported SQL transaction types combine with PostgreSQL semantics', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(1000), status: 'ACTIVE' },
      { type: 'PAYMENT', amount: d(200), status: 'ACTIVE' },
      { type: 'SALE', amount: d(500), saleMode: 'CREDIT', status: 'ACTIVE' },
      { type: 'SALE', amount: d(300), saleMode: 'CASH', status: 'ACTIVE' },
      { type: 'EXPENSE', amount: d(100), status: 'ACTIVE' },
      { type: 'OPENING_BALANCE', amount: d(50), openingDirection: 'INCREASE', status: 'ACTIVE' },
      { type: 'OPENING_BALANCE', amount: d(25), openingDirection: 'DECREASE', status: 'ACTIVE' },
      { type: 'SALE_RETURN', amount: d(75), status: 'ACTIVE' },
      { type: 'REFUND', amount: d(10), status: 'ACTIVE' },
    ]);
    assert.strictEqual(result.toString(), '1260');
  });

  it('9. multiple customers are combined with Decimal arithmetic', () => {
    const raju = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('450.00') },
      { type: 'PAYMENT', amount: d('200.00') },
      { type: 'SALE', amount: d('50.00'), saleMode: 'CREDIT' },
    ]);
    const amit = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('700.50') },
      { type: 'PAYMENT', amount: d('300.25') },
    ]);

    assert.strictEqual(raju.toFixed(2), '300.00');
    assert.strictEqual(amit.toFixed(2), '400.25');
    assert.strictEqual(raju.plus(amit).toFixed(2), '700.25');
  });

  it('10. overpayment produces a negative balance', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(100) },
      { type: 'PAYMENT', amount: d(300) },
    ]);
    assert.strictEqual(result.toString(), '-200');
  });

  it('11. decimal amounts are preserved exactly across types', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d('100.50') },
      { type: 'PAYMENT', amount: d('25.25') },
      { type: 'SALE', amount: d('10.10'), saleMode: 'CREDIT' },
      { type: 'SALE_RETURN', amount: d('0.05') },
      { type: 'REFUND', amount: d('0.02') },
      { type: 'OPENING_BALANCE', amount: d('0.01'), openingDirection: 'INCREASE' },
      { type: 'OPENING_BALANCE', amount: d('0.03'), openingDirection: 'DECREASE' },
    ]);
    assert.strictEqual(result.toFixed(2), '85.30');
  });

  it('12. empty transactions produce zero as Decimal', () => {
    const result = calculateOutstandingAmount([]);
    assert.ok(result instanceof Prisma.Decimal);
    assert.strictEqual(result.toString(), '0');
  });

  it('13. integer-based behavior remains correct', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: d(100) },
      { type: 'CREDIT', amount: d(200) },
      { type: 'PAYMENT', amount: d(50) },
      { type: 'SALE', amount: d(1000), saleMode: 'CASH' },
      { type: 'EXPENSE', amount: d(500) },
    ]);
    assert.strictEqual(result.toString(), '250');
  });

  it('14. accepts plain numeric amounts for backward compatibility', () => {
    const result = calculateOutstandingAmount([
      { type: 'CREDIT', amount: 100 },
      { type: 'PAYMENT', amount: 25.25 },
    ]);
    assert.strictEqual(result.toFixed(2), '74.75');
  });

  it('15. does not round away fractional precision', () => {
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
