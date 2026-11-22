import type { Request, Response } from 'express';
import { createTransaction } from '../services/ledger/transactionService.js';
import {
  createPreviewService,
  type ConfirmResult,
  type PreviewResult,
} from '../services/preview/previewService.js';
import { InMemoryPreviewStore } from '../services/preview/previewStore.js';

// In-memory store is process-local: previews are lost on restart and are not
// shared across instances. Replace with a persistent store for production.
const previewService = createPreviewService(new InMemoryPreviewStore());

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

function statusForCode(code: string): number {
  const statusByCode: Record<string, number> = {
    INVALID_PREVIEW: 404,
    EXPIRED: 410,
    ALREADY_CONFIRMED: 409,
    CANCELLED: 409,
    CONFIRMATION_IN_PROGRESS: 409,
    NOT_CANCELLABLE: 409,
    READ_ONLY_INTENT: 400,
    INVALID_INTENT: 400,
    LOW_CONFIDENCE: 400,
    MISSING_FIELDS: 400,
    NOT_READY: 400,
    COMMIT_FAILED: 500,
  };
  return statusByCode[code] ?? 400;
}

export async function createPreviewHandler(req: Request, res: Response) {
  const { transcript } = req.body ?? {};
  const preview = await previewService.createPreviewFromTranscript(String(transcript ?? ''));
  return res.status(201).json({ ok: true, data: preview });
}

export async function getPreviewHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  return respondWithResult(res, previewService.getPreviewResult(id));
}

export async function cancelPreviewHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  return respondWithResult(res, previewService.cancelPreviewResult(id));
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

export async function confirmPreviewHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  // Confirmation accepts no transaction details from the client; the only
  // accepted input is the preview id. The existing service is the write path.
  const result = await previewService.confirmPreview(id, createTransaction);
  return respondToConfirmation(res, result);
}
