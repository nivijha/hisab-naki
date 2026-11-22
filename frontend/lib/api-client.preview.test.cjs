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
  apiClient.setUnauthorizedHandler(null);
  apiClient.setBusinessForbiddenHandler(null);
  globalThis.fetch = originalFetch;
});

test('creates a transcript preview with bearer and selected-business headers', async () => {
  apiClient.setSession('test-token');
  apiClient.setBusinessContext('business-alpha');
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url).endsWith('/api/preview'), true);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { transcript: 'Raju ko 450 rupaye udhaar diya' });
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-token');
    assert.equal(headers.get('X-Business-ID'), 'business-alpha');
    return new Response(JSON.stringify({ ok: true, data: { id: 'p1' } }), { status: 201 });
  };
  const response = await apiClient.requestJson('/api/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: 'Raju ko 450 rupaye udhaar diya' }),
  });
  assert.equal(response.ok, true);
});

test('refuses preview requests when authentication or business context is absent', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  await assert.rejects(apiClient.requestJson('/api/preview', { method: 'POST' }), error => error instanceof ApiError && error.status === 401);
  apiClient.setSession('test-token');
  await assert.rejects(apiClient.requestJson('/api/preview', { method: 'POST' }), error => error instanceof ApiError && error.status === 403);
  assert.equal(called, false);
});

test('cancels a pending preview request when business context changes', async () => {
  apiClient.setSession('test-token');
  apiClient.setBusinessContext('business-alpha');
  let resolveResponse;
  let signal;
  globalThis.fetch = (_url, init) => {
    signal = init.signal;
    return new Promise(resolve => { resolveResponse = resolve; });
  };
  const pending = apiClient.requestJson('/api/preview', { method: 'POST', body: JSON.stringify({ transcript: 'text' }) });
  await new Promise(resolve => setImmediate(resolve));
  apiClient.setBusinessContext('business-beta');
  assert.equal(signal.aborted, true);
  resolveResponse(new Response(JSON.stringify({ ok: true, data: {} }), { status: 201 }));
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'business-changed');
});

test('cancels a pending preview request on logout and rejects its late response', async () => {
  apiClient.setSession('test-token');
  apiClient.setBusinessContext('business-alpha');
  let resolveResponse;
  let signal;
  globalThis.fetch = (_url, init) => {
    signal = init.signal;
    return new Promise(resolve => { resolveResponse = resolve; });
  };
  const pending = apiClient.requestJson('/api/preview', { method: 'POST', body: JSON.stringify({ transcript: 'text' }) });
  await new Promise(resolve => setImmediate(resolve));
  apiClient.clearSession();
  assert.equal(signal.aborted, true);
  resolveResponse(new Response(JSON.stringify({ ok: true, data: {} }), { status: 201 }));
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'session-changed');
});

test('maps expired previews without retrying confirmation', async () => {
  apiClient.setSession('test-token');
  apiClient.setBusinessContext('business-alpha');
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), method: init.method });
    return new Response(JSON.stringify({ ok: false, code: 'EXPIRED', message: 'Preview has expired.' }), { status: 410 });
  };
  await assert.rejects(apiClient.requestJson('/api/preview/p1/confirm', { method: 'POST' }), error => error instanceof ApiError && error.status === 410 && error.code === 'EXPIRED');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
});
