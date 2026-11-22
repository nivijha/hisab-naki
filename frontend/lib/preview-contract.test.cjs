const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './preview-contract.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
const { normalizeTransactionPreview, isSupportedPreviewWrite } = loaded.exports;

const base = {
  id: 'preview-1', businessId: 'business-alpha', intent: 'ADD_CREDIT', customerName: 'Raju',
  amount: 450.5, type: 'CREDIT', description: 'Goods', confidence: 0.9, missingFields: [],
  readyForConfirmation: true, state: 'pending', createdAt: '2026-11-22T10:00:00.000Z',
};

test('validates a complete credit preview and preserves the exact server amount', () => {
  const preview = normalizeTransactionPreview(base, 'business-alpha');
  assert.ok(preview);
  assert.equal(preview.amount, 450.5);
  assert.equal(isSupportedPreviewWrite(preview), true);
});

test('accepts explicit mocked repayment, sale, and expense preview types', () => {
  for (const [intent, type] of [['RECORD_PAYMENT', 'PAYMENT'], ['ADD_SALE', 'SALE'], ['ADD_EXPENSE', 'EXPENSE']]) {
    const preview = normalizeTransactionPreview({ ...base, intent, type }, 'business-alpha');
    assert.ok(preview);
    assert.equal(preview.type, type);
    assert.equal(isSupportedPreviewWrite(preview), true);
  }
});

test('keeps incomplete and read-only previews non-confirmable', () => {
  const incomplete = normalizeTransactionPreview({ ...base, readyForConfirmation: false, missingFields: ['amount'] }, 'business-alpha');
  assert.ok(incomplete);
  assert.equal(isSupportedPreviewWrite(incomplete), false);
  const readOnly = normalizeTransactionPreview({ ...base, intent: 'GET_BALANCE', type: undefined, amount: undefined, readyForConfirmation: false }, 'business-alpha');
  assert.ok(readOnly);
  assert.equal(isSupportedPreviewWrite(readOnly), false);
});

test('rejects malformed, unsafe, and cross-business preview data', () => {
  assert.equal(normalizeTransactionPreview({ ...base, amount: NaN }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, confidence: 1.2 }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, missingFields: 'amount' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, type: 'UNKNOWN' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, intent: 'RECORD_PAYMENT', type: 'CREDIT' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, readyForConfirmation: true, customerName: undefined }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview(base, 'business-beta'), null);
});

