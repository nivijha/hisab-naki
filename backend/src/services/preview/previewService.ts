import { randomUUID } from 'node:crypto';
import type { ParsedIntent } from '../ai/intentService.js';
import { interpretTranscript } from '../ai/intentService.js';
import type { CreateTransactionInput } from '../ledger/transactionService.js';
import { HttpError } from '../../middleware/authenticate.js';
import { PreviewStoreFullError } from './previewStore.js';
import {
  READ_INTENTS,
  WRITE_INTENTS,
  type PreviewStore,
  type PreviewTenantContext,
  type TransactionPreview,
  type TransactionType,
} from './previewStore.js';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

const intentToTransactionType: Record<string, TransactionType> = {
  ADD_CREDIT: 'CREDIT',
  RECORD_PAYMENT: 'PAYMENT',
  ADD_SALE: 'SALE',
  ADD_EXPENSE: 'EXPENSE',
};

export type TransactionCommitter = (input: CreateTransactionInput) => Promise<unknown>;

export type PreviewResult =
  | { ok: true; preview: TransactionPreview }
  | { ok: false; code: string; message: string };

export type ConfirmResult =
  | { ok: true; preview: TransactionPreview; result: unknown }
  | { ok: false; code: string; message: string; retryable?: boolean };

export type PreviewServiceOptions = {
  ttlMs?: number;
  now?: () => number;
};

function isWriteIntent(intent: ParsedIntent['intent']): boolean {
  return (WRITE_INTENTS as readonly string[]).includes(intent);
}

function isReadIntent(intent: ParsedIntent['intent']): boolean {
  return (READ_INTENTS as readonly string[]).includes(intent);
}

function resolveTtlMs(): number {
  const raw = process.env.PREVIEW_TTL_MS;
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_TTL_MS;
}

function assertValidContext(context: PreviewTenantContext): void {
  if (
    !context ||
    typeof context.businessId !== 'string' ||
    context.businessId.trim() === '' ||
    typeof context.createdByUserId !== 'string' ||
    context.createdByUserId.trim() === ''
  ) {
    throw new Error('Preview tenant context is required.');
  }
}

export function buildPreview(
  parsed: ParsedIntent,
  context: PreviewTenantContext,
  now: () => number = Date.now
): TransactionPreview {
  assertValidContext(context);
  const type = intentToTransactionType[parsed.intent];

  const readyForConfirmation =
    isWriteIntent(parsed.intent) &&
    parsed.confidence > 0 &&
    parsed.missingFields.length === 0 &&
    Boolean(type && parsed.customerName && parsed.amount);

  return {
    id: randomUUID(),
    businessId: context.businessId,
    createdByUserId: context.createdByUserId,
    intent: parsed.intent,
    customerName: parsed.customerName,
    amount: parsed.amount,
    type,
    description: parsed.description,
    confidence: parsed.confidence,
    missingFields: parsed.missingFields,
    readyForConfirmation,
    state: 'pending',
    createdAt: new Date(now()).toISOString(),
  };
}

export function createPreviewService(store: PreviewStore, options: PreviewServiceOptions = {}) {
  const ttlMs = options.ttlMs ?? resolveTtlMs();
  const now = options.now ?? Date.now;

  function isExpired(preview: TransactionPreview): boolean {
    const created = Date.parse(preview.createdAt);
    if (Number.isNaN(created)) {
      return true;
    }
    return now() - created >= ttlMs;
  }

  function createPreview(
    parsed: ParsedIntent,
    context: PreviewTenantContext
  ): TransactionPreview {
    store.pruneExpired(isExpired);
    const preview = buildPreview(parsed, context, now);
    try {
      store.create(preview);
    } catch (error) {
      if (error instanceof PreviewStoreFullError) {
        throw new HttpError(503, 'Preview store is full. Please try again later.');
      }
      throw error;
    }
    return preview;
  }

  function createPreviewFromTranscript(
    transcript: string,
    context: PreviewTenantContext
  ): Promise<TransactionPreview> {
    assertValidContext(context);
    // Interpretation is pure: it never creates or updates a transaction.
    return interpretTranscript(transcript).then((parsed) => createPreview(parsed, context));
  }

  function isOwnedBy(preview: TransactionPreview, context: PreviewTenantContext): boolean {
    return preview.businessId === context.businessId;
  }

  function getPreviewResult(id: string, context: PreviewTenantContext): PreviewResult {
    const preview = store.get(id);
    if (!preview || !isOwnedBy(preview, context)) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(preview)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    return { ok: true, preview };
  }

  function getPreview(id: string, context: PreviewTenantContext): TransactionPreview | undefined {
    const result = getPreviewResult(id, context);
    return result.ok ? result.preview : undefined;
  }

  function cancelPreviewResult(id: string, context: PreviewTenantContext): PreviewResult {
    const preview = store.get(id);
    if (!preview || !isOwnedBy(preview, context)) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(preview)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    if (preview.state !== 'pending') {
      return { ok: false, code: 'NOT_CANCELLABLE', message: 'Preview cannot be cancelled.' };
    }
    const cancelled: TransactionPreview = { ...preview, state: 'cancelled' };
    store.save(cancelled);
    return { ok: true, preview: cancelled };
  }

  function cancelPreview(id: string, context: PreviewTenantContext): TransactionPreview | undefined {
    const result = cancelPreviewResult(id, context);
    return result.ok ? result.preview : undefined;
  }

  function conflictResult(id: string): ConfirmResult {
    const current = store.get(id);
    if (!current) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(current)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    if (current.state === 'confirmed') {
      return { ok: false, code: 'ALREADY_CONFIRMED', message: 'Preview has already been confirmed.' };
    }
    if (current.state === 'cancelled') {
      return { ok: false, code: 'CANCELLED', message: 'Preview has been cancelled.' };
    }
    return {
      ok: false,
      code: 'CONFIRMATION_IN_PROGRESS',
      message: 'Another confirmation is already in progress for this preview.',
    };
  }

  async function confirmPreview(
    id: string,
    committer: TransactionCommitter,
    context: PreviewTenantContext
  ): Promise<ConfirmResult> {
    const preview = store.get(id);

    if (!preview) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(preview)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    if (preview.state === 'confirmed') {
      return { ok: false, code: 'ALREADY_CONFIRMED', message: 'Preview has already been confirmed.' };
    }
    if (preview.state === 'cancelled') {
      return { ok: false, code: 'CANCELLED', message: 'Preview has been cancelled.' };
    }
    if (preview.state === 'confirming') {
      return { ok: false, code: 'CONFIRMATION_IN_PROGRESS', message: 'Another confirmation is already in progress for this preview.' };
    }

    if (
      !context ||
      context.businessId !== preview.businessId ||
      context.createdByUserId !== preview.createdByUserId
    ) {
      return {
        ok: false,
        code: 'CONTEXT_MISMATCH',
        message: 'Preview tenant context does not match the confirmation context.',
      };
    }

    if (isReadIntent(preview.intent)) {
      return { ok: false, code: 'READ_ONLY_INTENT', message: 'Read-only intents cannot be committed.' };
    }
    if (!isWriteIntent(preview.intent)) {
      return { ok: false, code: 'INVALID_INTENT', message: 'Preview intent cannot be committed.' };
    }
    if (preview.confidence <= 0) {
      return { ok: false, code: 'LOW_CONFIDENCE', message: 'Preview confidence is too low to confirm.' };
    }

    const revalidationMissing: string[] = [];
    if (!preview.customerName) revalidationMissing.push('customerName');
    if (preview.amount === undefined || preview.amount === null || preview.amount <= 0) {
      revalidationMissing.push('amount');
    }
    if (!preview.type) revalidationMissing.push('type');

    if (revalidationMissing.length > 0) {
      return {
        ok: false,
        code: 'MISSING_FIELDS',
        message: `Cannot confirm preview. Missing: ${revalidationMissing.join(', ')}.`,
      };
    }

    if (!preview.readyForConfirmation) {
      return { ok: false, code: 'NOT_READY', message: 'Preview is not ready for confirmation.' };
    }

    // Atomic claim: pending -> confirming. Only one caller can succeed.
    const claimed = store.claim(id);
    if (!claimed) {
      return conflictResult(id);
    }

    // Guard against expiry occurring between validation and claim.
    if (isExpired(claimed)) {
      store.release(id);
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }

    try {
      const result = await committer({
        businessId: claimed.businessId,
        createdByUserId: claimed.createdByUserId,
        customerName: claimed.customerName as string,
        amount: claimed.amount as number,
        type: claimed.type as TransactionType,
        description: claimed.description,
      });

      // Confirm only after the commit succeeds.
      const confirmed = store.complete(id) ?? { ...claimed, state: 'confirmed' as const };
      return { ok: true, preview: confirmed, result };
    } catch {
      // Restore to a retryable state; a failed commit did not reach completion.
      store.release(id);
      return {
        ok: false,
        code: 'COMMIT_FAILED',
        message: 'Transaction commit failed. You may retry.',
        retryable: true,
      };
    }
  }

  return {
    createPreview,
    createPreviewFromTranscript,
    getPreview,
    getPreviewResult,
    cancelPreview,
    cancelPreviewResult,
    confirmPreview,
  };
}
