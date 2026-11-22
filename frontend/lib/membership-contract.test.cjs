const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './membership-contract.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
const { parseActiveMemberships } = loaded.exports;

const active = { membershipId: 'm-1', businessId: 'b-1', businessName: 'Shop Alpha', role: 'OWNER', status: 'ACTIVE' };

test('keeps only active memberships and preserves duplicate business names by IDs', () => {
  const result = parseActiveMemberships({ ok: true, data: [
    active,
    { ...active, membershipId: 'm-2', businessId: 'b-2', role: 'STAFF' },
    { ...active, membershipId: 'm-3', businessId: 'b-3', status: 'SUSPENDED' },
  ] });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(row => row.businessId), ['b-1', 'b-2']);
  assert.equal(result[0].businessName, result[1].businessName);
});

test('accepts a genuine zero-membership response', () => {
  assert.deepEqual(parseActiveMemberships({ ok: true, data: [] }), []);
});

test('rejects malformed membership envelopes and invalid membership rows', () => {
  assert.throws(() => parseActiveMemberships({ ok: true, data: null }));
  assert.throws(() => parseActiveMemberships({ ok: true, data: [{ ...active, businessId: '' }] }));
  assert.throws(() => parseActiveMemberships({ ok: true, data: [{ ...active, role: 'ROOT' }] }));
});
