const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loadTypeScript(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

function loadTsx(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const {
  buildTransactionHistoryPath,
  changeTransactionHistoryPage,
  isValidManualAmount,
  normalizeTransaction,
  normalizeTransactionHistory,
  updateTransactionHistoryFilters,
} = loadTypeScript('./transaction-contract.ts');
const { TransactionDetailStatus, TransactionRowStatus } = loadTsx('../components/dashboard/transaction-status.tsx');
const { formatInrAmount } = loadTypeScript('./inr.ts');

const row = {
  id: 'txn-1',
  type: 'PAYMENT',
  status: 'ACTIVE',
  amount: '125.50',
  description: null,
  createdAt: '2026-11-22T10:30:00.000Z',
  customer: { id: 'cust-1', name: 'Nivi' },
};

test('normalizes paginated history and preserves decimal strings and nullable descriptions', () => {
  const result = normalizeTransactionHistory({ transactions: [row], total: 21, page: 2, limit: 10, totalPages: 3 });
  assert.equal(result.total, 21);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
  assert.equal(result.transactions[0].amount, '125.50');
  assert.equal(result.transactions[0].description, '');
});

test('accepts legacy arrays without claiming pagination completeness', () => {
  const result = normalizeTransactionHistory([row]);
  assert.equal(result.total, null);
  assert.equal(result.totalPages, null);
  assert.equal(result.transactions.length, 1);
});

test('normalizes a transaction detail response without inventing optional data', () => {
  const result = normalizeTransaction({ ...row, customerId: 'cust-1' });
  assert.equal(result.id, 'txn-1');
  assert.equal(result.customerId, 'cust-1');
  assert.equal(result.description, '');
  assert.equal(normalizeTransaction({ ...row, id: '' }), null);
});

test('formats history and VOIDED detail amounts from the raw decimal field', () => {
  const transaction = Object.freeze({ ...row, amount: '100000.75', status: 'VOIDED', formattedAmount: '₹1,00,001' });
  const history = normalizeTransactionHistory([transaction]);
  const detail = normalizeTransaction(transaction);
  for (const result of [history.transactions[0], detail]) {
    assert.equal(formatInrAmount(result.amount), '₹1,00,000.75');
    assert.equal(result.amount, '100000.75');
    assert.equal(result.status, 'VOIDED');
  }
  assert.equal(transaction.amount, '100000.75');
});

test('preserves ACTIVE and VOIDED status and rejects absent or unrecognized status', () => {
  assert.equal(normalizeTransaction({ ...row, status: 'ACTIVE' }).status, 'ACTIVE');
  assert.equal(normalizeTransaction({ ...row, status: 'VOIDED' }).status, 'VOIDED');
  const { status: _status, ...withoutStatus } = row;
  assert.equal(normalizeTransaction(withoutStatus), null);
  assert.equal(normalizeTransaction({ ...row, status: null }), null);
  assert.equal(normalizeTransaction({ ...row, status: 'PENDING' }), null);
});

test('renders an accessible voided label for history and customer-ledger rows', () => {
  const markup = renderToStaticMarkup(React.createElement(TransactionRowStatus, { status: 'VOIDED' }));
  assert.match(markup, /Voided · excluded from balance/);
  assert.match(markup, /aria-hidden="true">Voided · excluded from balance/);
  assert.match(markup, /class="sr-only">Voided transaction; excluded from the outstanding balance/);
  assert.equal(renderToStaticMarkup(React.createElement(TransactionRowStatus, { status: 'ACTIVE' })), '');
});

test('renders explicit active and voided transaction-detail status', () => {
  const voided = renderToStaticMarkup(React.createElement(TransactionDetailStatus, { status: 'VOIDED' }));
  const active = renderToStaticMarkup(React.createElement(TransactionDetailStatus, { status: 'ACTIVE' }));
  assert.match(voided, /Voided · excluded from balance/);
  assert.match(voided, /aria-hidden="true">Voided · excluded from balance/);
  assert.match(voided, /class="sr-only">Voided transaction; excluded from the outstanding balance/);
  assert.match(active, />Active</);
});

test('dashboard uses the shared voided row status in history and customer ledgers without financial writes', () => {
  const dashboard = fs.readFileSync(path.resolve(__dirname, '../app/dashboard/page.tsx'), 'utf8');
  assert.match(dashboard, /<TransactionRowStatus status=\{transaction\.status\} \/>/);
  assert.match(dashboard, /<TransactionRows transactions=\{ledger\.transactions\} customerLedger \/>/);
  assert.match(dashboard, /<TransactionRows transactions=\{transactions\}/);
  assert.doesNotMatch(dashboard, /requestJson\(['"]\/api\/transactions['"]\s*,\s*\{\s*method:\s*['"]POST['"]/);
  assert.doesNotMatch(dashboard, /\/api\/preview\/[^'"\s]+\/(?:confirm|cancel)/);
});

test('rejects malformed page metadata and malformed transaction rows', () => {
  assert.equal(normalizeTransactionHistory({ transactions: [row], total: 1, page: 0, limit: 10, totalPages: 1 }), null);
  assert.equal(normalizeTransactionHistory({ transactions: [{ ...row, amount: 'NaN' }], total: 1, page: 1, limit: 10, totalPages: 1 }), null);
  assert.equal(normalizeTransactionHistory({ transactions: [row], total: 1, page: 1, limit: 10 }), null);
  const empty = normalizeTransactionHistory({ transactions: [], total: 0, page: 1, limit: 10, totalPages: 0 });
  assert.equal(empty.transactions.length, 0);
  assert.equal(empty.total, 0);
});

test('builds combined supported filters and page navigation query parameters', () => {
  const path = buildTransactionHistoryPath({
    page: 3, limit: 10, type: 'CREDIT', customerId: 'cust 1', from: '2026-11-01', to: '2026-11-22',
  });
  const params = new URL(path, 'http://localhost').searchParams;
  assert.equal(params.get('page'), '3');
  assert.equal(params.get('limit'), '10');
  assert.equal(params.get('type'), 'CREDIT');
  assert.equal(params.get('customerId'), 'cust 1');
  assert.equal(params.get('from'), new Date('2026-11-01T00:00:00').toISOString());
  assert.equal(params.get('to'), new Date('2026-11-22T23:59:59.999').toISOString());
});

test('filter changes reset pagination while next and previous keep active filters', () => {
  const original = { page: 4, type: 'CREDIT', customerId: 'cust-1', from: '', to: '' };
  const filtered = updateTransactionHistoryFilters(original, { from: '2026-11-01' });
  assert.equal(filtered.page, 1);
  assert.equal(filtered.type, 'CREDIT');
  assert.equal(filtered.customerId, 'cust-1');
  assert.equal(filtered.from, '2026-11-01');
  const next = changeTransactionHistoryPage(filtered, 2, 3);
  assert.equal(next.page, 2);
  assert.equal(next.type, 'CREDIT');
  assert.equal(changeTransactionHistoryPage(next, 0, 3).page, 1);
  assert.equal(changeTransactionHistoryPage(next, 4, 3).page, 3);
});

test('validates manual INR amount text without rounding or floating-point conversion', () => {
  assert.equal(isValidManualAmount('0.50'), true);
  assert.equal(isValidManualAmount('999999999999.99'), true);
  assert.equal(isValidManualAmount('0'), false);
  assert.equal(isValidManualAmount('-1'), false);
  assert.equal(isValidManualAmount('1.234'), false);
  assert.equal(isValidManualAmount('1000000000000'), false);
});

test('formats manual review without rewriting the draft amount', () => {
  for (const [draft, display] of [['25.5', '₹25.50'], ['25.50', '₹25.50'], ['0.05', '₹0.05'], ['999999999999.99', '₹9,99,99,99,99,999.99']]) {
    assert.equal(isValidManualAmount(draft), true);
    assert.equal(formatInrAmount(draft), display);
  }
});
