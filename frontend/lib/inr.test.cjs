const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, 'inr.ts');
const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = new Module(filename, module);
loaded._compile(outputText, filename);
const { formatInrAmount, readInrAmount } = loaded.exports;

test('displays whole rupees, zero, and one- and two-digit paise consistently', () => {
  for (const [amount, display] of [
    [100, '₹100'], ['100.00', '₹100'], [0, '₹0'], ['-0.00', '₹0'],
    [25.5, '₹25.50'], ['25.50', '₹25.50'], [0.5, '₹0.50'], ['0.05', '₹0.05'],
  ]) {
    assert.equal(formatInrAmount(amount), display);
  }
});

test('groups large exact amounts and preserves signed customer balances', () => {
  for (const [amount, display] of [
    ['100000.75', '₹1,00,000.75'],
    ['999999999999.99', '₹9,99,99,99,99,999.99'],
    ['123456789012345.67', '₹12,34,56,78,90,12,345.67'],
    [-0.5, '-₹0.50'],
    ['-100000.75', '-₹1,00,000.75'],
  ]) {
    assert.equal(readInrAmount(amount), String(amount));
    assert.equal(formatInrAmount(amount), display);
  }
});

test('keeps validated decimal text and numeric values separate from presentation', () => {
  assert.equal(readInrAmount('100.00'), '100.00');
  assert.equal(readInrAmount('25.5'), '25.5');
  assert.equal(readInrAmount('25.50'), '25.50');
  assert.equal(readInrAmount(100000.75), '100000.75');
});

test('shows unavailable for missing, malformed, over-precise, and unsafe numbers', () => {
  for (const amount of [
    undefined, null, '', ' ', false, {}, [], 'NaN', Infinity, NaN,
    '1,000.00', '₹25.50', '01.00', '1e3', '25.555', 0.1 + 0.2, 2 ** 46,
  ]) {
    assert.equal(readInrAmount(amount), null);
    assert.equal(formatInrAmount(amount), '—');
  }
});
