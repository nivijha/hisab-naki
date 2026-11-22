import type { Request, Response } from 'express';
import { createTransaction } from '../services/ledger/transactionService.js';
import {
  createPreviewService,
  type ConfirmResult,
  type PreviewResult,
} from '../services/preview/previewService.js';
import {
  InMemoryPreviewStore,
  type PreviewTenantContext,
} from '../services/preview/previewStore.js';
import { requireAuth } from '../middleware/authenticate.js';
import { logger } from '../utils/logger.js';

// Process-local: previews are lost on restart and are not shared across instances.
const previewService = createPreviewService(new InMemoryPreviewStore());

export type PreviewControllerServices = {
  previewService: typeof previewService;
  createTransaction: typeof createTransaction;
};

const defaultServices: PreviewControllerServices = { previewService, createTransaction };

function statusForCode(code: string): number {
  const statusByCode: Record<string, number> = {
    INVALID_PREVIEW: 404,
    EXPIRED: 410,
    ALREADY_CONFIRMED: 409,
    CANCELLED: 409,
    CONFIRMATION_IN_PROGRESS: 409,
    NOT_CANCELLABLE: 409,
    CONTEXT_MISMATCH: 409,
    READ_ONLY_INTENT: 400,
    INVALID_INTENT: 400,
    LOW_CONFIDENCE: 400,
    MISSING_FIELDS: 400,
    NOT_READY: 400,
    COMMIT_FAILED: 500,
  };
  return statusByCode[code] ?? 400;
}

function respondWithResult(res: Response, result: PreviewResult) {
  if (result.ok) {
    return res.json({ ok: true, data: result.preview });
  }
  return res.status(statusForCode(result.code)).json({
    ok: false,
    code: result.code,
    message: result.message,
  });
}

function respondToConfirmation(res: Response, result: ConfirmResult) {
  if (result.ok) {
    return res.json({ ok: true, data: result.preview, result: result.result });
  }
  return res.status(statusForCode(result.code)).json({
    ok: false,
    code: result.code,
    message: result.message,
    ...(result.retryable ? { retryable: true } : undefined),
  });
}

export function createPreviewController(services: PreviewControllerServices = defaultServices) {
  async function createPreviewHandler(req: Request, res: Response) {
    const { businessId, userId } = requireAuth(req);
    const { transcript } = req.body ?? {};
    const context: PreviewTenantContext = { businessId, createdByUserId: userId };
    const preview = await services.previewService.createPreviewFromTranscript(
      String(transcript ?? ''),
      context
    );
    return res.status(201).json({ ok: true, data: preview });
  }

  async function getPreviewHandler(req: Request, res: Response) {
    const { businessId, userId } = requireAuth(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const context: PreviewTenantContext = { businessId, createdByUserId: userId };
    return respondWithResult(res, services.previewService.getPreviewResult(id, context));
  }

  async function cancelPreviewHandler(req: Request, res: Response) {
    const { businessId, userId } = requireAuth(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const context: PreviewTenantContext = { businessId, createdByUserId: userId };
    return respondWithResult(res, services.previewService.cancelPreviewResult(id, context));
  }

  async function confirmPreviewHandler(req: Request, res: Response) {
    const { businessId, userId } = requireAuth(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const context: PreviewTenantContext = { businessId, createdByUserId: userId };
    const result = await services.previewService.confirmPreview(id, services.createTransaction, context);
    logger.info(result.ok ? 'preview.confirmed' : 'preview.confirm_failed', {
      previewId: id,
      businessId,
      code: result.ok ? undefined : result.code,
    });
    return respondToConfirmation(res, result);
  }

  return {
    createPreviewHandler,
    getPreviewHandler,
    cancelPreviewHandler,
    confirmPreviewHandler,
  };
}

export const previewController = createPreviewController();
