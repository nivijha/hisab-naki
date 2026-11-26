const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './signup-api.ts');
const calls = [];
let nextResponse;
const fakeApiClient = {
  requestJson: async (url, init, scope) => {
    calls.push({ url, init, scope });
    return nextResponse;
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './api-client' && parent?.filename === filename) return { apiClient: fakeApiClient, ApiError: class ApiError extends Error {} };
  if (request === './signup-contract' && parent?.filename === filename) return contract.exports;
  return originalLoad.call(this, request, parent, isMain);
};
const contractPath = path.resolve(__dirname, './signup-contract.ts');
const contractOutput = ts.transpileModule(fs.readFileSync(contractPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contract = new Module(contractPath, module);
contract.filename = contractPath;
contract.paths = Module._nodeModulePaths(path.dirname(contractPath));
contract._compile(contractOutput, contractPath);

const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
Module._load = originalLoad;
const { registerSignup, registerPrototypeSignup, resendSignupCode, verifySignupCode, createFirstBusiness } = loaded.exports;

test.beforeEach(() => { calls.length = 0; });

test('sends exact public signup, resend, and verification contracts', async () => {
  nextResponse = { ok: true, data: { maskedPhone: '••••3210', expiresAt: '2026-11-23T10:10:00Z', verificationRequired: true } };
  await registerSignup({ name: 'Nivi', phone: '9876543210', password: 'a-long-password' });
  assert.equal(calls[0].url, '/api/auth/register');
  assert.equal(calls[0].scope, 'public');
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Nivi', phone: '9876543210', password: 'a-long-password' });

  nextResponse = { ok: true, data: { message: 'If signup verification is pending, a new code has been sent.' } };
  await resendSignupCode('+919876543210');
  assert.equal(calls[1].url, '/api/auth/register/resend');
  assert.deepEqual(JSON.parse(calls[1].init.body), { phone: '+919876543210' });

  nextResponse = { ok: true, data: { verified: true } };
  await verifySignupCode('+919876543210', '123456');
  assert.equal(calls[2].url, '/api/auth/register/verify');
  assert.deepEqual(JSON.parse(calls[2].init.body), { phone: '+919876543210', code: '123456' });
});

test('creates the first business with bearer-auth scope, exact body, and stable idempotency header', async () => {
  nextResponse = { ok: true, data: {
    business: { id: 'b-1', name: 'Kirana', currency: 'INR' },
    membership: { membershipId: 'm-1', businessId: 'b-1', role: 'OWNER', status: 'ACTIVE' }, replayed: false,
  } };
  await createFirstBusiness('Kirana', 'onboard-test-key-1');
  assert.equal(calls[0].url, '/api/businesses');
  assert.equal(calls[0].scope, 'auth');
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Kirana' });
  assert.equal(new Headers(calls[0].init.headers).get('Idempotency-Key'), 'onboard-test-key-1');
});

test('prototype signup posts to /api/auth/signup as a public request with the exact body', async () => {
  nextResponse = { ok: true, data: {
    user: { id: 'user-1', name: 'Nivi Shopkeeper', email: 'user@example.com', phone: null },
  } };
  const result = await registerPrototypeSignup({ name: 'Nivi Shopkeeper', email: 'user@example.com', password: 'a-long-password' });
  assert.equal(calls[0].url, '/api/auth/signup');
  assert.equal(calls[0].scope, 'public');
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Nivi Shopkeeper', email: 'user@example.com', password: 'a-long-password' });
  assert.equal(result.user.email, 'user@example.com');
  assert.equal(result.user.phone, null);
});
