import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildPreview,
  createPreviewService,
  type TransactionCommitter,
} from '../../../services/preview/previewService.js';
import { InMemoryPreviewStore } from '../../../services/preview/previewStore.js';
import type { PreviewTenantContext } from '../../../services/preview/previewStore.js';
import type { CreateTransactionInput } from '../../../services/ledger/transactionService.js';
import type { ParsedIntent } from '../../../services/ai/intentService.js';

const CONTEXT: PreviewTenantContext = { businessId: 'biz-1', createdByUserId: 'user-1' };
const OTHER_CONTEXT: PreviewTenantContext = { businessId: 'biz-2', createdByUserId: 'user-2' };

function makeParsed(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    intent: 'ADD_CREDIT',
    customerName: 'Raju',
    amount: 500,
    description: 'Udhaar',
    confidence: 0.9,
    missingFields: [],
    ...overrides,
  };
}

describe('preview service - concurrency hardening', () => {
  it('two simultaneous confirmation requests: only one commits', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { committed: true };
    };

    const [a, b] = await Promise.all([
      service.confirmPreview(preview.id, committer, CONTEXT),
      service.confirmPreview(preview.id, committer, CONTEXT),
    ]);

    assert.strictEqual(commitCalls, 1);
    const results = [a, b];
    assert.strictEqual(results.filter((r) => r.ok).length, 1);
    assert.strictEqual(results.filter((r) => !r.ok).length, 1);
    const conflict = results.find((r) => !r.ok);
    if (conflict && !conflict.ok) assert.strictEqual(conflict.code, 'CONFIRMATION_IN_PROGRESS');
  });

  it('a subsequent confirmation after an in-flight one gets a conflict', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let releaseCommit: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseCommit = resolve; });
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; await gate; return {}; };

    const inFlight = service.confirmPreview(preview.id, committer, CONTEXT);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const late = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(late.ok, false);
    if (!late.ok) assert.strictEqual(late.code, 'CONFIRMATION_IN_PROGRESS');
    assert.strictEqual(commitCalls, 1);

    releaseCommit();
    const first = await inFlight;
    assert.strictEqual(first.ok, true);
    assert.strictEqual(commitCalls, 1);

    const after = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(after.ok, false);
    if (!after.ok) assert.strictEqual(after.code, 'ALREADY_CONFIRMED');
    assert.strictEqual(commitCalls, 1);
  });

  it('commit failure returns COMMIT_FAILED and restores a retryable state', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const failingCommitter: TransactionCommitter = async () => {
      commitCalls += 1;
      throw new Error('db write failed');
    };

    const result = await service.confirmPreview(preview.id, failingCommitter, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'COMMIT_FAILED');
      assert.strictEqual(result.retryable, true);
    }
    assert.strictEqual(commitCalls, 1);
    const current = service.getPreview(preview.id);
    assert.ok(current);
    assert.strictEqual(current.state, 'pending');
  });

  it('retrying after a failed commit succeeds and commits exactly once more', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const flakyCommitter: TransactionCommitter = async () => {
      commitCalls += 1;
      if (commitCalls === 1) throw new Error('temporary failure');
      return { committed: true };
    };

    const first = await service.confirmPreview(preview.id, flakyCommitter, CONTEXT);
    assert.strictEqual(first.ok, false);
    const retry = await service.confirmPreview(preview.id, flakyCommitter, CONTEXT);
    assert.strictEqual(retry.ok, true);
    assert.strictEqual(commitCalls, 2);
    const confirmed = service.getPreviewResult(preview.id);
    assert.strictEqual(confirmed.ok, true);
    if (confirmed.ok) assert.strictEqual(confirmed.preview.state, 'confirmed');
  });

  it('a failed commit is never marked confirmed', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    const committer: TransactionCommitter = async () => { throw new Error('failure'); };
    await service.confirmPreview(preview.id, committer, CONTEXT);
    const current = service.getPreview(preview.id);
    assert.ok(current);
    assert.notStrictEqual(current.state, 'confirmed');
  });

  it('a context mismatch never claims the preview', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };

    const mismatch = await service.confirmPreview(preview.id, committer, OTHER_CONTEXT);
    assert.strictEqual(mismatch.ok, false);

    const valid = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(valid.ok, true);
    assert.strictEqual(commitCalls, 1, 'only the matching confirmation committed');
  });

  it('committed transaction input always uses the stored tenant context', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => { calls.push(input); return {}; };

    await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(calls[0].businessId, CONTEXT.businessId);
    assert.strictEqual(calls[0].createdByUserId, CONTEXT.createdByUserId);
    assert.notStrictEqual(calls[0].businessId, OTHER_CONTEXT.businessId);
  });
});

describe('preview service - expiry', () => {
  const TTL = 1000;
  const START = 1_000_000;

  function makeService(nowRef: { value: number }) {
    return createPreviewService(new InMemoryPreviewStore(), { ttlMs: TTL, now: () => nowRef.value });
  }

  it('a valid preview remains usable before expiry', async () => {
    const nowRef = { value: START };
    const service = makeService(nowRef);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    nowRef.value = START + TTL - 1;
    const result = await service.confirmPreview(preview.id, async () => ({ ok: true }), CONTEXT);
    assert.strictEqual(result.ok, true);
  });

  it('preview expires after the configured TTL', () => {
    const nowRef = { value: START };
    const service = makeService(nowRef);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    nowRef.value = START + TTL;
    const result = service.getPreviewResult(preview.id);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'EXPIRED');
  });

  it('expired preview cannot be confirmed', async () => {
    const nowRef = { value: START };
    const service = makeService(nowRef);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    nowRef.value = START + TTL + 1;
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'EXPIRED');
    assert.strictEqual(commitCalls, 0);
    assert.strictEqual(preview.state, 'pending');
  });

  it('expired preview cannot be cancelled', () => {
    const nowRef = { value: START };
    const service = makeService(nowRef);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    nowRef.value = START + TTL + 1;
    const result = service.cancelPreviewResult(preview.id);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'EXPIRED');
    const second = service.cancelPreviewResult(preview.id);
    assert.strictEqual(second.ok, false);
    if (!second.ok) assert.strictEqual(second.code, 'EXPIRED');
  });

  it('expired preview retrieval returns the expected response', () => {
    const nowRef = { value: START };
    const service = makeService(nowRef);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    nowRef.value = START + TTL + 1;
    const result = service.getPreviewResult(preview.id);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.message, 'Preview has expired.');
    assert.strictEqual(service.getPreview(preview.id), undefined);
  });

  it('buildPreview uses the injected clock for createdAt', () => {
    const now = () => START + 42;
    const preview = buildPreview(makeParsed(), CONTEXT, now);
    assert.strictEqual(Date.parse(preview.createdAt), START + 42);
    assert.strictEqual(preview.businessId, CONTEXT.businessId);
    assert.strictEqual(preview.createdByUserId, CONTEXT.createdByUserId);
  });
});
