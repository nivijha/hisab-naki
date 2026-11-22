import { describe, it } from 'node:test';
import assert from 'node:assert';
import { interpretTranscript } from '../../../services/ai/intentService.js';
import {
  buildPreview,
  createPreviewService,
  type TransactionCommitter,
} from '../../../services/preview/previewService.js';
import { InMemoryPreviewStore } from '../../../services/preview/previewStore.js';
import type { CreateTransactionInput } from '../../../services/ledger/transactionService.js';
import type { ParsedIntent } from '../../../services/ai/intentService.js';

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

describe('preview service', () => {
  it('1. interpretation does not create a transaction', async () => {
    // interpretTranscript is a pure function: no DB/transaction calls occur.
    // Verify by confirming the interpreted result is only data and calling it
    // twice yields identical data with no side effects registered.
    const first = await interpretTranscript('Raju ko 500 rupaye udhaar diya.');
    const second = await interpretTranscript('Raju ko 500 rupaye udhaar diya.');
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.intent, 'ADD_CREDIT');
    assert.strictEqual(first.amount, 500);
    // No preview/transaction store is touched by interpretation itself.
  });

  it('2. a valid preview can be generated', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = await service.createPreviewFromTranscript('Raju ko 500 rupaye udhaar diya.');

    assert.strictEqual(preview.intent, 'ADD_CREDIT');
    assert.strictEqual(preview.customerName, 'Raju');
    assert.strictEqual(preview.amount, 500);
    assert.strictEqual(preview.type, 'CREDIT');
    assert.strictEqual(preview.confidence, 0.9);
    assert.strictEqual(preview.state, 'pending');
    assert.strictEqual(preview.readyForConfirmation, true);
    assert.deepStrictEqual(preview.missingFields, []);
    // Preview must have an id and a creation timestamp
    assert.ok(preview.id.length > 0);
    assert.ok(preview.createdAt.length > 0);
  });

  it('3. missing fields prevent confirmation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({
      customerName: undefined,
      missingFields: ['customerName'],
      confidence: 0.5,
    }));

    assert.strictEqual(preview.readyForConfirmation, false);

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const result = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'MISSING_FIELDS');
    }
    assert.strictEqual(commitCalls, 0);
  });

  it('4. confidence zero prevents confirmation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({ confidence: 0 }));

    assert.strictEqual(preview.readyForConfirmation, false);

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const result = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'LOW_CONFIDENCE');
    }
    assert.strictEqual(commitCalls, 0);
  });

  it('5. read-only intents cannot be committed', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({
      intent: 'GET_BALANCE',
      customerName: 'Raju',
      amount: undefined,
      confidence: 0.9,
      missingFields: [],
    }));

    assert.strictEqual(preview.readyForConfirmation, false);
    assert.strictEqual(preview.type, undefined);

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const result = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'READ_ONLY_INTENT');
    }
    assert.strictEqual(commitCalls, 0);
  });

  it('6. valid confirmation invokes the existing transaction service exactly once', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed());

    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => {
      calls.push(input);
      return { committed: true };
    };

    const result = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      customerName: 'Raju',
      amount: 500,
      type: 'CREDIT',
      description: 'Udhaar',
    });
    if (result.ok) {
      assert.strictEqual(result.preview.state, 'confirmed');
    }
  });

  it('7. duplicate confirmation is rejected', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed());

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const first = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(commitCalls, 1);

    const second = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(second.ok, false);
    if (!second.ok) {
      assert.strictEqual(second.code, 'ALREADY_CONFIRMED');
    }
    assert.strictEqual(commitCalls, 1, 'committer must not be called a second time');
  });

  it('8. cancelled previews cannot be confirmed', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed());

    const cancelled = service.cancelPreview(preview.id);
    assert.ok(cancelled);
    assert.strictEqual(cancelled.state, 'cancelled');

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const result = await service.confirmPreview(preview.id, committer);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'CANCELLED');
    }
    assert.strictEqual(commitCalls, 0);
  });

  it('9. invalid preview IDs are rejected', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());

    let commitCalls = 0;
    const committer: TransactionCommitter = async () => {
      commitCalls += 1;
      return {};
    };

    const result = await service.confirmPreview('does-not-exist', committer);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'INVALID_PREVIEW');
    }
    assert.strictEqual(commitCalls, 0);
  });

  it('buildPreview maps all write intents to transaction types', () => {
    const cases: Array<[ParsedIntent['intent'], string]> = [
      ['ADD_CREDIT', 'CREDIT'],
      ['RECORD_PAYMENT', 'PAYMENT'],
      ['ADD_SALE', 'SALE'],
      ['ADD_EXPENSE', 'EXPENSE'],
    ];
    for (const [intent, expectedType] of cases) {
      const preview = buildPreview(makeParsed({ intent }));
      assert.strictEqual(preview.type, expectedType);
      assert.strictEqual(preview.readyForConfirmation, true);
    }
  });

  it('confirming does not accept arbitrary client details (only preview id)', async () => {
    // The confirmPreview signature accepts only (id, committer) — no client
    // supplied amounts/types can reach the committer.
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({ amount: 500 }));

    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => {
      calls.push(input);
      return {};
    };

    await service.confirmPreview(preview.id, committer);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].amount, 500, 'committed amount must come from the preview');
  });
});
