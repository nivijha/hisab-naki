const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './api-client.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
const { apiClient, ApiError } = loaded.exports;
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  apiClient.clearSession();
  apiClient.clearBusinessContext();
  globalThis.fetch = originalFetch;
});

test('sends the existing login contract without bearer or business headers', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url).endsWith('/api/auth/login'), true);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { identifier: 'shop@example.in', password: 'secret-value' });
    const headers = new Headers(init.headers);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('X-Business-ID'), false);
    assert.equal(init.credentials, 'omit');
    return new Response(JSON.stringify({ ok: true, data: { token: 'jwt-value' } }), { status: 200 });
  };
  await apiClient.login('shop@example.in', 'secret-value');
});

test('does not place credentials in the login URL', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(String(url).includes('secret-value'), false);
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  };
  await apiClient.login('shop@example.in', 'secret-value');
});

test('normalizes invalid login JSON and credential errors', async () => {
  globalThis.fetch = async () => new Response('not json', { status: 200 });
  await assert.rejects(apiClient.login('a', 'b'), error => error instanceof ApiError && error.kind === 'invalid-response');
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'invalid' }), { status: 401 });
  await assert.rejects(apiClient.login('a', 'b'), error => error instanceof ApiError && error.status === 401);
});

test('preserves rate-limit feedback for login', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, message: 'Too many attempts.' }), { status: 429 });
  await assert.rejects(apiClient.login('a', 'b'), error => error instanceof ApiError && error.status === 429 && error.message === 'Too many attempts.');
});
