const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './signup-contract.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
const { parseSignupStart, parseResendResponse, isSignupVerified, parseCreatedFirstBusiness } = loaded.exports;

test('validates registration and verification envelopes without accepting incomplete data', () => {
  assert.deepEqual(parseSignupStart({ ok: true, data: { maskedPhone: '••••••3210', expiresAt: '2026-11-23T10:10:00Z', verificationRequired: true } }), {
    maskedPhone: '••••••3210', expiresAt: '2026-11-23T10:10:00Z', verificationRequired: true,
  });
  assert.equal(parseSignupStart({ ok: true, data: { maskedPhone: '1234', expiresAt: 'bad', verificationRequired: true } }), null);
  assert.equal(parseResendResponse({ ok: true, data: { message: 'If pending, a code was sent.' } }), 'If pending, a code was sent.');
  assert.equal(isSignupVerified({ ok: true, data: { verified: true } }), true);
  assert.equal(isSignupVerified({ ok: true, data: { verified: false } }), false);
});

test('accepts only a server-created active owner membership matching the business ID', () => {
  const value = { ok: true, data: {
    business: { id: 'business-1', name: 'Kirana', currency: 'INR' },
    membership: { membershipId: 'membership-1', businessId: 'business-1', role: 'OWNER', status: 'ACTIVE' },
    replayed: true,
  } };
  assert.equal(parseCreatedFirstBusiness(value).membership.membershipId, 'membership-1');
  assert.equal(parseCreatedFirstBusiness({ ...value, data: { ...value.data, membership: { ...value.data.membership, businessId: 'business-other' } } }), null);
  assert.equal(parseCreatedFirstBusiness({ ...value, data: { ...value.data, membership: { ...value.data.membership, role: 'STAFF' } } }), null);
  assert.equal(parseCreatedFirstBusiness({ ok: true, data: {} }), null);
});
