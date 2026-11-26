const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

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

const { apiClient, ApiError } = loadTypeScript('./api-client.ts');
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  apiClient.clearSession();
  apiClient.setUnauthorizedHandler(null);
  apiClient.setBusinessForbiddenHandler(null);
  globalThis.fetch = originalFetch;
});

test('scopes transaction reads with the current bearer and selected-business headers', async () => {
  apiClient.markSessionChanged();
  apiClient.setBusinessContext('business-alpha');
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.get('X-Business-ID'), 'business-alpha');
    return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
  };

  await apiClient.requestJson('/api/transactions?page=1&limit=10');
});

test('refuses transaction reads until authenticated business context exists', async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
  };
  await assert.rejects(apiClient.requestJson('/api/transactions?page=1&limit=10'), error => error instanceof ApiError && error.status === 403);
  apiClient.markSessionChanged();
  await assert.rejects(apiClient.requestJson('/api/transactions?page=1&limit=10'), error => error instanceof ApiError && error.status === 403);
  assert.equal(called, false);
});

test('rejects and cancels a history response after business context changes', async () => {
  apiClient.markSessionChanged();
  apiClient.setBusinessContext('business-alpha');
  let resolveResponse;
  let requestSignal;
  globalThis.fetch = (_input, init) => {
    requestSignal = init.signal;
    return new Promise(resolve => { resolveResponse = resolve; });
  };

  const pending = apiClient.requestJson('/api/transactions?page=2&limit=10');
  await new Promise(resolve => setImmediate(resolve));
  apiClient.setBusinessContext('business-beta');
  assert.equal(requestSignal.aborted, true);
  resolveResponse(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }));
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'business-changed');
});

test('rejects an old request after logout even if the response arrives late', async () => {
  apiClient.markSessionChanged();
  apiClient.setBusinessContext('business-alpha');
  let resolveResponse;
  globalThis.fetch = () => new Promise(resolve => { resolveResponse = resolve; });

  const pending = apiClient.requestJson('/api/transactions?page=1&limit=10');
  await new Promise(resolve => setImmediate(resolve));
  apiClient.clearSession();
  resolveResponse(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }));
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'session-changed');
});
