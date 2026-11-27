const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => dependencies[specifier] ?? originalRequire(specifier);
  loaded._compile(output, filename);
  return loaded.exports;
}

const inr = loadTypeScript('./inr.ts');
const { normalizeTransactionPreview, isSupportedPreviewWrite } = loadTypeScript('./preview-contract.ts', { './inr': inr });

const base = {
  id: 'preview-1', businessId: 'business-alpha', intent: 'ADD_CREDIT', customerName: 'Raju',
  customerId: 'cust-1',
  amount: 450.5, type: 'CREDIT', description: 'Goods', confidence: 0.9, missingFields: [],
  customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] },
  readyForConfirmation: true, state: 'pending', createdAt: '2026-11-22T10:00:00.000Z',
};

test('validates a complete credit preview and preserves the exact server amount', () => {
  const preview = normalizeTransactionPreview(base, 'business-alpha');
  assert.ok(preview);
  assert.equal(preview.amount, 450.5);
  assert.equal(isSupportedPreviewWrite(preview), true);
});

test('formats voice paise without modifying the parsed amount', () => {
  const preview = normalizeTransactionPreview({ ...base, amount: 25.5 }, 'business-alpha');
  assert.equal(inr.formatInrAmount(preview.amount), '₹25.50');
  assert.equal(preview.amount, 25.5);
});

test('accepts explicit mocked repayment, sale, and expense preview types', () => {
  for (const [intent, type] of [['RECORD_PAYMENT', 'PAYMENT'], ['ADD_SALE', 'SALE'], ['ADD_EXPENSE', 'EXPENSE']]) {
    const needsCustomer = intent === 'RECORD_PAYMENT';
    const preview = normalizeTransactionPreview({
      ...base,
      intent,
      type,
      ...(needsCustomer
        ? { customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] } }
        : { customerResolution: { status: 'not_required', candidates: [] } }),
    }, 'business-alpha');
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
  for (const amount of [NaN, 0, -1, 0.001, 25.555, 2 ** 46, '25.50']) {
    assert.equal(normalizeTransactionPreview({ ...base, amount }, 'business-alpha'), null);
  }
  assert.equal(normalizeTransactionPreview({ ...base, confidence: 1.2 }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, missingFields: 'amount' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, type: 'UNKNOWN' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, intent: 'RECORD_PAYMENT', type: 'CREDIT' }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, readyForConfirmation: true, customerName: undefined }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview({ ...base, readyForConfirmation: true, customerId: undefined }, 'business-alpha'), null);
  assert.equal(normalizeTransactionPreview(base, 'business-beta'), null);
});

