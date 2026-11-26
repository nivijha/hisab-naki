const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, './api-client.ts');
const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = new Module(filename, module);
loaded._compile(outputText, filename);
const { apiClient, ApiError } = loaded.exports;
const originalFetch = globalThis.fetch;
const deadline = 15_000;
const history = '/api/transactions?page=1&limit=10';
const summary = '/api/dashboard/summary';
const memberships = '/api/auth/memberships';
const success = { ok: true, data: [] };

function mockSession() {
  apiClient.setSession('fixture-session');
  apiClient.setBusinessContext('first-shop');
}

function deferFetch() {
  const requests = [];
  globalThis.fetch = (url, init) => new Promise(resolve => requests.push({ url, init, resolve }));
  return requests;
}

function isError(kind, status) {
  return error => error instanceof ApiError && error.kind === kind && error.status === status;
}

test.afterEach(() => {
  apiClient.setUnauthorizedHandler(null);
  apiClient.setBusinessForbiddenHandler(null);
  apiClient.clearSession();
  globalThis.fetch = originalFetch;
});

test('login finishes at its deadline even when fetch ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const requests = deferFetch();
  const result = assert.rejects(apiClient.login('fixture@example.test', 'fixture-only', controller.signal), isError('timeout'));

  t.mock.timers.tick(deadline - 1);
  assert.equal(requests[0].init.signal.aborted, false);
  t.mock.timers.tick(1);
  await result;
  assert.equal(requests[0].init.signal.aborted, true);
  assert.equal(controller.signal.aborted, false);
  assert.equal(requests.length, 1);
});

test('a membership response just before its deadline succeeds and disarms the timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mockSession();
  const requests = deferFetch();
  const pending = apiClient.requestJson(memberships, {}, 'auth');
  t.mock.timers.tick(deadline - 1);
  requests[0].resolve(Response.json(success));
  assert.deepEqual(await pending, success);
  t.mock.timers.tick(1);
  assert.equal(requests[0].init.signal.aborted, false);
});

test('a late HTTP 401 after a read deadline cannot invalidate the session or affect an explicit retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mockSession();
  const requests = deferFetch();
  let unauthorized = 0;
  apiClient.setUnauthorizedHandler(() => { unauthorized += 1; });
  const first = assert.rejects(apiClient.requestJson(summary), isError('timeout'));
  t.mock.timers.tick(deadline);
  await first;
  assert.equal(requests.length, 1);

  const retry = apiClient.requestJson(summary);
  requests[0].resolve(Response.json({ ok: false }, { status: 401 }));
  requests[1].resolve(Response.json(success));
  assert.deepEqual(await retry, success);
  assert.equal(unauthorized, 0);
  assert.equal(new Headers(requests[1].init.headers).get('X-Business-ID'), 'first-shop');
});

test('the read deadline covers a stalled response body as well as headers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mockSession();
  let readingBody = false;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json() {
      readingBody = true;
      return new Promise(() => {});
    },
  });
  const pending = assert.rejects(apiClient.requestJson(history), isError('timeout'));
  await Promise.resolve();
  assert.equal(readingBody, true);
  t.mock.timers.tick(deadline);
  await pending;
});

test('distinguishes disconnects, rate limits and server errors without automatic retries', async () => {
  mockSession();
  let count = 0;
  globalThis.fetch = async () => {
    count += 1;
    if (count === 1) throw new TypeError('Network disconnected');
    return Response.json({ ok: false }, { status: count === 2 ? 429 : 500 });
  };
  await assert.rejects(apiClient.requestJson(summary), isError('network'));
  await assert.rejects(apiClient.requestJson(summary), isError('http', 429));
  await assert.rejects(apiClient.requestJson(summary), isError('http', 500));
  assert.equal(count, 3);
});

test('current-session HTTP 401 invokes logout even with an invalid JSON error body', async () => {
  mockSession();
  const requests = deferFetch();
  apiClient.setUnauthorizedHandler(() => apiClient.clearSession());
  const pending = assert.rejects(apiClient.requestJson(memberships, {}, 'auth'), isError('http', 401));
  requests[0].resolve(new Response('Not JSON', { status: 401 }));
  await pending;
  assert.equal(apiClient.getToken(), null);
  await assert.rejects(apiClient.requestJson(summary), isError('http', 401));
  assert.equal(requests.length, 1);
});

test('logout retires pending authenticated reads without waiting for a transport response', async () => {
  mockSession();
  const requests = deferFetch();
  const read = assert.rejects(apiClient.requestJson(memberships, {}, 'auth'), isError('session-changed'));
  apiClient.clearSession();
  await read;
  assert.equal(requests[0].init.signal.aborted, true);
});

test('switching businesses retires the old read and scopes the next one', async () => {
  mockSession();
  const requests = deferFetch();
  const previous = assert.rejects(apiClient.requestJson(history), isError('business-changed'));
  apiClient.setBusinessContext('second-shop');
  await previous;
  const current = apiClient.requestJson(history);
  requests[0].resolve(Response.json({ ok: true, data: ['stale'] }));
  requests[1].resolve(Response.json(success));
  assert.equal(requests[0].init.signal.aborted, true);
  assert.equal(new Headers(requests[1].init.headers).get('X-Business-ID'), 'second-shop');
  assert.deepEqual(await current, success);
});

test('unmount-style caller abort cancels body reading and cannot return a late success', async () => {
  mockSession();
  let finishBody;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: () => new Promise(resolve => { finishBody = resolve; }),
  });
  const controller = new AbortController();
  const read = assert.rejects(apiClient.requestJson('/api/customers/cust-1', { signal: controller.signal }), isError('aborted'));
  await Promise.resolve();
  controller.abort();
  await read;
  finishBody(success);
});

test('a request cancelled before dispatch never calls fetch', async () => {
  const requests = deferFetch();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(apiClient.login('fixture@example.test', 'fixture-only', controller.signal), isError('aborted'));
  assert.equal(requests.length, 0);
});

test('potential writes keep their caller deadline and stable request data without auto-retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mockSession();
  const requests = deferFetch();
  const controller = new AbortController();
  const body = JSON.stringify({ name: 'Synthetic shop' });
  const write = assert.rejects(apiClient.requestJson('/api/businesses', {
    method: 'POST', body, signal: controller.signal, headers: { 'Idempotency-Key': 'onboarding-fixture-key' },
  }, 'auth'), isError('timeout'));
  t.mock.timers.tick(deadline);
  assert.equal(requests[0].init.signal.aborted, false);
  controller.abort(new DOMException('Deadline elapsed', 'TimeoutError'));
  await write;
  assert.equal(requests[0].init.signal.aborted, true);
  assert.equal(requests[0].init.body, body);
  assert.equal(new Headers(requests[0].init.headers).get('Idempotency-Key'), 'onboarding-fixture-key');
  assert.equal(requests.length, 1);
});
