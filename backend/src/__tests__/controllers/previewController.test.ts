import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPreviewController, type PreviewControllerServices } from '../../controllers/previewController.js';
import { TEST_AUTH, makeReq, makeRes } from '../helpers/http.js';

function makeServices(preview: Record<string, unknown> | null = null) {
  const calls: Record<string, unknown[][]> = { create: [], confirm: [] };
  const defaultPreview = preview ?? {
    id: 'preview-1',
    businessId: 'biz-1',
    createdByUserId: 'user-1',
    state: 'pending',
    readyForConfirmation: true,
  };
  const services = {
    previewService: {
      createPreviewFromTranscript: async (...args: unknown[]) => {
        calls.create.push(args);
        return defaultPreview;
      },
      getPreviewResult: () => ({ ok: true, preview: defaultPreview }),
      cancelPreviewResult: () => ({ ok: true, preview: { ...defaultPreview, state: 'cancelled' } }),
      confirmPreview: async (...args: unknown[]) => {
        calls.confirm.push(args);
        return { ok: true, preview: { ...defaultPreview, state: 'confirmed' }, result: {} };
      },
    },
    createTransaction: async () => ({}),
  } as unknown as PreviewControllerServices;
  return { services, calls };
}

describe('preview controller - tenant context', () => {
  it('creation stores authenticated businessId and createdByUserId', async () => {
    const { services, calls } = makeServices();
    const controller = createPreviewController(services);
    const res = makeRes();

    await controller.createPreviewHandler(
      makeReq({ auth: TEST_AUTH, body: { transcript: 'Raju ko 500 udhaar diya' } }),
      res
    );

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(calls.create[0][0], 'Raju ko 500 udhaar diya');
    assert.deepStrictEqual(calls.create[0][1], { businessId: 'biz-1', createdByUserId: 'user-1' });
  });

  it('confirmation passes the authenticated context to the service', async () => {
    const { services, calls } = makeServices();
    const controller = createPreviewController(services);

    await controller.confirmPreviewHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'preview-1' } }),
      makeRes()
    );

    assert.strictEqual(calls.confirm[0][0], 'preview-1');
    assert.deepStrictEqual(calls.confirm[0][2], { businessId: 'biz-1', createdByUserId: 'user-1' });
    assert.strictEqual(typeof calls.confirm[0][1], 'function', 'committer provided');
  });

  it('a preview belonging to another business is not retrievable', async () => {
    const foreignPreview = { id: 'preview-1', businessId: 'biz-2', createdByUserId: 'user-2' };
    const { services } = makeServices(foreignPreview);
    const controller = createPreviewController(services);
    const res = makeRes();

    await controller.getPreviewHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'preview-1' } }),
      res
    );

    assert.strictEqual(res.statusCode, 404);
  });

  it('a preview belonging to another business cannot be cancelled', async () => {
    const foreignPreview = { id: 'preview-1', businessId: 'biz-2', createdByUserId: 'user-2' };
    const { services } = makeServices(foreignPreview);
    const controller = createPreviewController(services);
    const res = makeRes();

    await controller.cancelPreviewHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'preview-1' } }),
      res
    );

    assert.strictEqual(res.statusCode, 404);
  });

  it('CONTEXT_MISMATCH maps to HTTP 409', async () => {
    const services = {
      previewService: {
        createPreviewFromTranscript: async () => ({}),
        getPreviewResult: () => ({ ok: true, preview: {} }),
        cancelPreviewResult: () => ({ ok: true, preview: {} }),
        confirmPreview: async () => ({ ok: false, code: 'CONTEXT_MISMATCH', message: 'mismatch' }),
      },
      createTransaction: async () => ({}),
    } as unknown as PreviewControllerServices;
    const controller = createPreviewController(services);
    const res = makeRes();

    await controller.confirmPreviewHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'preview-1' } }),
      res
    );

    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { ok: false, code: 'CONTEXT_MISMATCH', message: 'mismatch' });
  });
});
