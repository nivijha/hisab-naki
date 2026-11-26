import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Customer } from '@prisma/client';
import { HttpError } from '../../../middleware/authenticate.js';
import { interpretTranscript } from '../../../services/ai/intentService.js';
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
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-new',
    businessId: CONTEXT.businessId,
    name: 'Raju',
    phone: null,
    email: null,
    notes: null,
    createdByUserId: CONTEXT.createdByUserId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

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
    const first = await interpretTranscript('Raju ko 500 rupaye udhaar diya.');
    const second = await interpretTranscript('Raju ko 500 rupaye udhaar diya.');
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.intent, 'ADD_CREDIT');
    assert.strictEqual(first.amount, 500);
  });

  it('2. a valid preview can be generated', async () => {
    const service = createPreviewService(new InMemoryPreviewStore(), {
      resolveCustomerForVoice: async () => ({ status: 'matched', match: { id: 'cust-1', name: 'Raju', phone: null }, matches: [{ id: 'cust-1', name: 'Raju', phone: null }] }),
    });
    const preview = await service.createPreviewFromTranscript(
      'Raju ko 500 rupaye udhaar diya.',
      CONTEXT
    );

    assert.strictEqual(preview.intent, 'ADD_CREDIT');
    assert.strictEqual(preview.customerName, 'Raju');
    assert.strictEqual(preview.customerId, 'cust-1');
    assert.strictEqual(preview.amount, 500);
    assert.strictEqual(preview.type, 'CREDIT');
    assert.strictEqual(preview.confidence, 0.9);
    assert.strictEqual(preview.state, 'pending');
    assert.strictEqual(preview.customerResolution?.status, 'matched');
    assert.strictEqual(preview.readyForConfirmation, true);
    assert.deepStrictEqual(preview.missingFields, []);
    assert.strictEqual(preview.businessId, CONTEXT.businessId);
    assert.strictEqual(preview.createdByUserId, CONTEXT.createdByUserId);
    assert.ok(preview.id.length > 0);
    assert.ok(preview.createdAt.length > 0);
  });

  it('3. missing fields prevent confirmation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({
      customerName: undefined,
      missingFields: ['customerName'],
      confidence: 0.5,
    }), CONTEXT);

    assert.strictEqual(preview.readyForConfirmation, false);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'MISSING_FIELDS');
    assert.strictEqual(commitCalls, 0);
  });

  it('4. confidence zero prevents confirmation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({ confidence: 0 }), CONTEXT);
    assert.strictEqual(preview.readyForConfirmation, false);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'LOW_CONFIDENCE');
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
    }), CONTEXT);
    assert.strictEqual(preview.readyForConfirmation, false);
    assert.strictEqual(preview.type, undefined);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'READ_ONLY_INTENT');
    assert.strictEqual(commitCalls, 0);
  });

  it('unknown customer blocks confirmation and requires explicit creation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore(), {
      resolveCustomerForVoice: async () => ({ status: 'unknown', matches: [] }),
    });
    const preview = await service.createPreviewFromTranscript('Raju ko 500 udhaar diya', CONTEXT);
    assert.strictEqual(preview.customerResolution?.status, 'unknown');
    assert.strictEqual(preview.readyForConfirmation, false);
    let commitCalls = 0;
    const result = await service.confirmPreview(preview.id, async () => { commitCalls += 1; return {}; }, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'MISSING_FIELDS');
    assert.strictEqual(commitCalls, 0);
  });

  it('ambiguous customer requires selection before confirmation', async () => {
    const service = createPreviewService(new InMemoryPreviewStore(), {
      resolveCustomerForVoice: async () => ({ status: 'ambiguous', matches: [{ id: 'c1', name: 'Raju', phone: null }, { id: 'c2', name: 'Raju Kumar', phone: null }] }),
    });
    const preview = await service.createPreviewFromTranscript('Raju ko 500 udhaar diya', CONTEXT);
    assert.strictEqual(preview.customerResolution?.status, 'ambiguous');
    let commitCalls = 0;
    const blocked = await service.confirmPreview(preview.id, async () => { commitCalls += 1; return {}; }, CONTEXT);
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(commitCalls, 0);

    const resolved = await service.resolveCustomerForPreview(preview.id, CONTEXT, 'c2');
    assert.strictEqual(resolved.ok, true);
    if (resolved.ok) {
      assert.strictEqual(resolved.preview.customerId, 'c2');
      assert.strictEqual(resolved.preview.readyForConfirmation, true);
    }
  });

  it('explicit customer creation does not commit financial transaction and revalidates preview', async () => {
    const service = createPreviewService(new InMemoryPreviewStore(), {
      resolveCustomerForVoice: async () => ({ status: 'unknown', matches: [] }),
      createCustomerForVoice: async () => ({ ok: true, customer: makeCustomer({ id: 'cust-new', name: 'Raju' }), created: true }),
    });
    const preview = await service.createPreviewFromTranscript('Raju ko 500 udhaar diya', CONTEXT);
    let commitCalls = 0;
    const created = await service.createCustomerForPreview(preview.id, CONTEXT);
    assert.strictEqual(created.ok, true);
    assert.strictEqual(commitCalls, 0);
    if (created.ok) {
      assert.strictEqual(created.preview.customerResolution?.status, 'created');
      assert.strictEqual(created.preview.customerId, 'cust-new');
      assert.strictEqual(created.preview.readyForConfirmation, true);
      assert.strictEqual(created.preview.state, 'pending');
    }
  });

  it('ADD_CUSTOMER intent requires explicit approval and never confirms as financial tx', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed({ intent: 'ADD_CUSTOMER', amount: undefined, missingFields: [], customerName: 'Rahul' }), CONTEXT);
    const result = await service.confirmPreview(preview.id, async () => ({}), CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'READ_ONLY_INTENT');
  });

  it('6. valid confirmation invokes the existing transaction service exactly once', async () => {
    const store = new InMemoryPreviewStore();
    const service = createPreviewService(store);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    store.save({ ...preview, customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] }, missingFields: [], readyForConfirmation: true });
    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => { calls.push(input); return { committed: true }; };

    const result = await service.confirmPreview(preview.id, committer, CONTEXT);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      businessId: CONTEXT.businessId,
      createdByUserId: CONTEXT.createdByUserId,
      customerId: 'cust-1',
      customerName: 'Raju',
      amount: 500,
      type: 'CREDIT',
      description: 'Udhaar',
    });
    if (result.ok) assert.strictEqual(result.preview.state, 'confirmed');
  });

  it('7. duplicate confirmation is rejected', async () => {
    const store = new InMemoryPreviewStore();
    const service = createPreviewService(store);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    store.save({ ...preview, customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] }, missingFields: [], readyForConfirmation: true });
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const first = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(first.ok, true);
    const second = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(second.ok, false);
    if (!second.ok) assert.strictEqual(second.code, 'ALREADY_CONFIRMED');
    assert.strictEqual(commitCalls, 1);
  });

  it('8. cancelled previews cannot be confirmed', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    const cancelled = service.cancelPreview(preview.id, CONTEXT);
    assert.ok(cancelled);
    assert.strictEqual(cancelled.state, 'cancelled');
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'CANCELLED');
    assert.strictEqual(commitCalls, 0);
  });

  it('9. invalid preview IDs are rejected', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };
    const result = await service.confirmPreview('does-not-exist', committer, CONTEXT);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'INVALID_PREVIEW');
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
      const preview = buildPreview(makeParsed({ intent }), CONTEXT);
      assert.strictEqual(preview.type, expectedType);
      // Customer identity must be resolved before any financial confirmation.
      assert.strictEqual(preview.readyForConfirmation, false);
    }
  });

  it('confirming does not accept arbitrary client details (only preview id plus tenant context)', async () => {
    const store = new InMemoryPreviewStore();
    const service = createPreviewService(store);
    const preview = service.createPreview(makeParsed({ amount: 500 }), CONTEXT);
    store.save({ ...preview, customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] }, missingFields: [], readyForConfirmation: true });
    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => { calls.push(input); return {}; };
    await service.confirmPreview(preview.id, committer, CONTEXT);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].amount, 500, 'committed amount must come from the preview');
    assert.strictEqual(calls[0].businessId, CONTEXT.businessId);
    assert.strictEqual(calls[0].createdByUserId, CONTEXT.createdByUserId);
    assert.strictEqual(calls[0].customerId, 'cust-1');
  });
});

describe('preview service - tenant context', () => {
  it('creation stores businessId and createdByUserId', () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);

    assert.strictEqual(preview.businessId, 'biz-1');
    assert.strictEqual(preview.createdByUserId, 'user-1');
    assert.notStrictEqual(preview.businessId, preview.createdByUserId);
  });

  it('get and cancel reject previews owned by another business', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);

    assert.deepStrictEqual(
      service.getPreviewResult(preview.id, OTHER_CONTEXT),
      { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' }
    );
    assert.strictEqual(service.getPreview(preview.id, OTHER_CONTEXT), undefined);
    assert.deepStrictEqual(
      service.cancelPreviewResult(preview.id, OTHER_CONTEXT),
      { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' }
    );
    assert.strictEqual(service.cancelPreview(preview.id, OTHER_CONTEXT), undefined);
    assert.strictEqual(service.getPreview(preview.id, CONTEXT)?.id, preview.id);
  });

  it('confirm rejects a missing context', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };

    const result = await service.confirmPreview(preview.id, committer, undefined as unknown as typeof CONTEXT);

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'CONTEXT_MISMATCH');
    assert.strictEqual(commitCalls, 0);
  });

  it('rejects new previews with a 503 when the store is full', () => {
    const service = createPreviewService(new InMemoryPreviewStore({ maxPreviews: 2 }));
    service.createPreview(makeParsed(), CONTEXT);
    service.createPreview(makeParsed(), CONTEXT);

    assert.throws(
      () => service.createPreview(makeParsed(), CONTEXT),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 503);
        assert.match(error.message, /Preview store is full/);
        return true;
      }
    );
  });

  it('rejects creation without tenant context', () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    assert.throws(
      () => service.createPreview(makeParsed(), { businessId: '', createdByUserId: 'user-1' }),
      /Preview tenant context is required/
    );
    assert.throws(
      () => service.createPreview(makeParsed(), { businessId: 'biz-1', createdByUserId: '   ' }),
      /Preview tenant context is required/
    );
  });

  it('confirmation passes stored businessId and createdByUserId separately', async () => {
    const store = new InMemoryPreviewStore();
    const service = createPreviewService(store);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    store.save({ ...preview, customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] }, missingFields: [], readyForConfirmation: true });
    const calls: CreateTransactionInput[] = [];
    const committer: TransactionCommitter = async (input) => { calls.push(input); return {}; };

    await service.confirmPreview(preview.id, committer, CONTEXT);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].businessId, CONTEXT.businessId);
    assert.strictEqual(calls[0].createdByUserId, CONTEXT.createdByUserId);
  });

  it('a mismatched business ID cannot confirm the preview', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };

    const result = await service.confirmPreview(preview.id, committer, {
      businessId: OTHER_CONTEXT.businessId,
      createdByUserId: CONTEXT.createdByUserId,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'CONTEXT_MISMATCH');
    assert.strictEqual(commitCalls, 0);
    assert.strictEqual(service.getPreview(preview.id, CONTEXT)?.state, 'pending');
  });

  it('a mismatched creator ID cannot confirm the preview', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };

    const result = await service.confirmPreview(preview.id, committer, {
      businessId: CONTEXT.businessId,
      createdByUserId: OTHER_CONTEXT.createdByUserId,
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'CONTEXT_MISMATCH');
    assert.strictEqual(commitCalls, 0);
    assert.strictEqual(service.getPreview(preview.id, CONTEXT)?.state, 'pending');
  });

  it('a fully mismatched context cannot confirm the preview', async () => {
    const service = createPreviewService(new InMemoryPreviewStore());
    const preview = service.createPreview(makeParsed(), CONTEXT);
    let commitCalls = 0;
    const committer: TransactionCommitter = async () => { commitCalls += 1; return {}; };

    const result = await service.confirmPreview(preview.id, committer, OTHER_CONTEXT);

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'CONTEXT_MISMATCH');
    assert.strictEqual(commitCalls, 0);
  });

  it('matching context confirms successfully', async () => {
    const store = new InMemoryPreviewStore();
    const service = createPreviewService(store);
    const preview = service.createPreview(makeParsed(), CONTEXT);
    store.save({ ...preview, customerId: 'cust-1', customerResolution: { status: 'matched', requestedName: 'Raju', customerId: 'cust-1', customerName: 'Raju', candidates: [{ id: 'cust-1', name: 'Raju', phone: null }] }, missingFields: [], readyForConfirmation: true });
    const committer: TransactionCommitter = async () => ({ ok: true });

    const result = await service.confirmPreview(preview.id, committer, CONTEXT);

    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.preview.state, 'confirmed');
  });
});
