import { randomUUID } from 'node:crypto';
import type { ParsedIntent } from '../ai/intentService.js';
import { interpretTranscript } from '../ai/intentService.js';
import type { CreateTransactionInput } from '../ledger/transactionService.js';
import { createCustomerForVoice, resolveCustomerForVoice } from '../ledger/customerService.js';
import { HttpError } from '../../middleware/authenticate.js';
import { PreviewStoreFullError } from './previewStore.js';
import {
  READ_INTENTS,
  WRITE_INTENTS,
  type CustomerResolution,
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
  resolveCustomerForVoice?: typeof resolveCustomerForVoice;
  createCustomerForVoice?: typeof createCustomerForVoice;
};

function isWriteIntent(intent: ParsedIntent['intent']): boolean {
  return (WRITE_INTENTS as readonly string[]).includes(intent);
}

function isReadIntent(intent: ParsedIntent['intent']): boolean {
  return (READ_INTENTS as readonly string[]).includes(intent);
}

function intentRequiresCustomer(intent: ParsedIntent['intent']): boolean {
  return ['ADD_CREDIT', 'RECORD_PAYMENT', 'GET_BALANCE', 'GET_CUSTOMER_TRANSACTIONS', 'ADD_CUSTOMER'].includes(intent);
}

function isFinancialWriteIntent(intent: ParsedIntent['intent']): boolean {
  return isWriteIntent(intent);
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

function customerResolutionForParsed(parsed: ParsedIntent): CustomerResolution | undefined {
  if (parsed.intent === 'ADD_CUSTOMER') {
    return {
      status: parsed.customerName ? 'unknown' : 'unknown',
      requestedName: parsed.customerName,
      candidates: [],
      requiresCustomerCreationApproval: Boolean(parsed.customerName),
    };
  }
  if (!intentRequiresCustomer(parsed.intent)) return { status: 'not_required', candidates: [] };
  if (!parsed.customerName) return undefined;
  return { status: 'unknown', requestedName: parsed.customerName, candidates: [], requiresCustomerCreationApproval: true };
}

function withCustomerResolution(
  preview: TransactionPreview,
  resolution: CustomerResolution | undefined,
  parsed: ParsedIntent
): TransactionPreview {
  const missing = new Set(preview.missingFields);
  missing.delete('customerResolution');
  missing.delete('customerId');

  let customerId = preview.customerId;
  let customerName = preview.customerName;

  if (resolution?.status === 'matched' || resolution?.status === 'created') {
    customerId = resolution.customerId ?? customerId;
    customerName = resolution.customerName ?? customerName;
    missing.delete('customerName');
  } else if (resolution?.status === 'ambiguous') {
    missing.add('customerResolution');
  } else if (resolution?.status === 'unknown') {
    if (intentRequiresCustomer(parsed.intent) || intentRequiresCustomer(preview.intent)) missing.add('customerResolution');
  }

  const type = intentToTransactionType[preview.intent];
  const customerReady =
    !intentRequiresCustomer(preview.intent) ||
    resolution?.status === 'matched' ||
    resolution?.status === 'created' ||
    resolution?.status === 'not_required';

  const readyForConfirmation =
    isFinancialWriteIntent(preview.intent) &&
    preview.confidence > 0 &&
    missing.size === 0 &&
    Boolean(type && customerName && preview.amount && customerReady && customerId);

  return {
    ...preview,
    customerId,
    customerName,
    type,
    missingFields: [...missing],
    customerResolution: resolution,
    readyForConfirmation,
  };
}

export function buildPreview(
  parsed: ParsedIntent,
  context: PreviewTenantContext,
  now: () => number = Date.now
): TransactionPreview {
  assertValidContext(context);
  const type = intentToTransactionType[parsed.intent];
  const base: TransactionPreview = {
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
    readyForConfirmation: false,
    state: 'pending',
    createdAt: new Date(now()).toISOString(),
  };
  return withCustomerResolution(base, customerResolutionForParsed(parsed), parsed);
}

export function createPreviewService(store: PreviewStore, options: PreviewServiceOptions = {}) {
  const ttlMs = options.ttlMs ?? resolveTtlMs();
  const now = options.now ?? Date.now;
  const resolveCustomerForVoiceFn = options.resolveCustomerForVoice ?? resolveCustomerForVoice;
  const createCustomerForVoiceFn = options.createCustomerForVoice ?? createCustomerForVoice;

  function isExpired(preview: TransactionPreview): boolean {
    const created = Date.parse(preview.createdAt);
    if (Number.isNaN(created)) {
      return true;
    }
    return now() - created >= ttlMs;
  }

  async function resolvePreviewCustomer(
    preview: TransactionPreview,
    parsed: ParsedIntent,
    context: PreviewTenantContext
  ): Promise<TransactionPreview> {
    if (parsed.intent === 'ADD_CUSTOMER') {
      return withCustomerResolution(preview, {
        status: 'unknown',
        requestedName: parsed.customerName,
        candidates: [],
        requiresCustomerCreationApproval: Boolean(parsed.customerName),
      }, parsed);
    }
    if (!intentRequiresCustomer(parsed.intent) || !parsed.customerName) {
      return withCustomerResolution(preview, intentRequiresCustomer(parsed.intent) ? undefined : { status: 'not_required', candidates: [] }, parsed);
    }

    const resolved = await resolveCustomerForVoiceFn(context.businessId, parsed.customerName);
    if (resolved.status === 'matched') {
      return withCustomerResolution(preview, {
        status: 'matched',
        requestedName: parsed.customerName,
        customerId: resolved.match.id,
        customerName: resolved.match.name,
        candidates: resolved.matches,
      }, parsed);
    }
    if (resolved.status === 'ambiguous') {
      return withCustomerResolution(preview, {
        status: 'ambiguous',
        requestedName: parsed.customerName,
        candidates: resolved.matches,
        requiresCustomerDisambiguation: true,
      }, parsed);
    }
    return withCustomerResolution(preview, {
      status: 'unknown',
      requestedName: parsed.customerName,
      candidates: [],
      requiresCustomerCreationApproval: true,
    }, parsed);
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

  async function createPreviewFromTranscript(
    transcript: string,
    context: PreviewTenantContext
  ): Promise<TransactionPreview> {
    assertValidContext(context);
    // Interpretation is pure: it never creates or updates a transaction.
    const parsed = await interpretTranscript(transcript);
    const preview = createPreview(parsed, context);
    if (preview.confidence <= 0 || parsed.missingFields.includes('intent')) return preview;

    const resolved = await resolvePreviewCustomer(preview, parsed, context);
    if (resolved !== preview) store.save(resolved);
    return resolved;
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

  async function resolveCustomerForPreview(
    id: string,
    context: PreviewTenantContext,
    customerId: string
  ): Promise<PreviewResult> {
    const preview = store.get(id);
    if (!preview || !isOwnedBy(preview, context)) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(preview)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    if (preview.state !== 'pending') {
      return { ok: false, code: 'NOT_CANCELLABLE', message: 'Preview cannot be updated.' };
    }
    const resolution = preview.customerResolution;
    if (resolution?.status !== 'ambiguous') {
      return { ok: false, code: 'NOT_READY', message: 'Preview does not require customer selection.' };
    }
    const selected = resolution.candidates.find((c) => c.id === customerId);
    if (!selected) {
      return { ok: false, code: 'MISSING_FIELDS', message: 'Selected customer is not a valid match for this preview.' };
    }
    const updated = withCustomerResolution(preview, {
      status: 'matched',
      requestedName: resolution.requestedName,
      customerId: selected.id,
      customerName: selected.name,
      candidates: resolution.candidates,
    }, {
      intent: preview.intent,
      confidence: preview.confidence,
      missingFields: preview.missingFields,
      customerName: selected.name,
      amount: preview.amount,
      description: preview.description,
    });
    store.save(updated);
    return { ok: true, preview: updated };
  }

  async function createCustomerForPreview(
    id: string,
    context: PreviewTenantContext,
    customerName?: string
  ): Promise<PreviewResult> {
    const preview = store.get(id);
    if (!preview || !isOwnedBy(preview, context)) {
      return { ok: false, code: 'INVALID_PREVIEW', message: 'Invalid or unknown preview.' };
    }
    if (isExpired(preview)) {
      return { ok: false, code: 'EXPIRED', message: 'Preview has expired.' };
    }
    if (preview.state !== 'pending') {
      return { ok: false, code: 'NOT_CANCELLABLE', message: 'Preview cannot be updated.' };
    }
    const resolution = preview.customerResolution;
    if (resolution?.status !== 'unknown') {
      return { ok: false, code: 'NOT_READY', message: 'Preview does not require customer creation.' };
    }
    const requestedName = (customerName ?? resolution.requestedName ?? preview.customerName ?? '').trim();
    if (!requestedName) {
      return { ok: false, code: 'MISSING_FIELDS', message: 'Customer name is required.' };
    }
    // Create/reuse customer only; no financial transaction is committed here.
    const created = await createCustomerForVoiceFn(context.businessId, context.createdByUserId, requestedName);
    if (!created.ok) {
      return { ok: false, code: 'INVALID_INTENT', message: created.message };
    }
    const updated = withCustomerResolution(preview, {
      status: 'created',
      requestedName,
      customerId: created.customer.id,
      customerName: created.customer.name,
      candidates: [{ id: created.customer.id, name: created.customer.name, phone: created.customer.phone ?? null }],
    }, {
      intent: preview.intent,
      confidence: preview.confidence,
      missingFields: preview.missingFields,
      customerName: created.customer.name,
      amount: preview.amount,
      description: preview.description,
    });
    store.save(updated);
    return { ok: true, preview: updated };
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

    if (preview.intent === 'ADD_CUSTOMER') {
      return { ok: false, code: 'READ_ONLY_INTENT', message: 'Customer creation requires explicit approval before any transaction can be confirmed.' };
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

    const resolution = preview.customerResolution;
    if (intentRequiresCustomer(preview.intent) && resolution?.status !== 'matched' && resolution?.status !== 'created') {
      return {
        ok: false,
        code: 'MISSING_FIELDS',
        message: 'Customer must be resolved before confirming this transaction.',
      };
    }

    const revalidationMissing: string[] = [];
    if (!preview.customerName) revalidationMissing.push('customerName');
    if (intentRequiresCustomer(preview.intent) && !preview.customerId) revalidationMissing.push('customerId');
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
        customerId: claimed.customerId,
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
    resolveCustomerForPreview,
    createCustomerForPreview,
  };
}
