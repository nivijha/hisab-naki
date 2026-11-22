import type { ParsedIntent } from '../ai/intentService.js';

export const WRITE_INTENTS = [
  'ADD_CREDIT',
  'RECORD_PAYMENT',
  'ADD_SALE',
  'ADD_EXPENSE',
] as const;

export const READ_INTENTS = [
  'GET_BALANCE',
  'GET_TOTAL_OUTSTANDING',
  'GET_TODAY_TRANSACTIONS',
  'GET_CUSTOMER_TRANSACTIONS',
] as const;

export type TransactionType = 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';

export type PreviewTenantContext = {
  businessId: string;
  createdByUserId: string;
};

export type PreviewState = 'pending' | 'confirming' | 'confirmed' | 'cancelled';

export type TransactionPreview = {
  id: string;
  businessId: string;
  createdByUserId: string;
  intent: ParsedIntent['intent'];
  customerName?: string;
  amount?: number;
  type?: TransactionType;
  description?: string;
  confidence: number;
  missingFields: string[];
  readyForConfirmation: boolean;
  state: PreviewState;
  createdAt: string;
};

export class PreviewStoreFullError extends Error {
  constructor() {
    super('Preview store is full.');
    this.name = 'PreviewStoreFullError';
  }
}

export interface PreviewStore {
  create(preview: TransactionPreview): void;
  get(id: string): TransactionPreview | undefined;
  save(preview: TransactionPreview): void;
  pruneExpired(isExpired: (preview: TransactionPreview) => boolean): number;
  size(): number;
  // Atomically transition state. Implementations must perform the check and
  // update without any asynchronous gap, so only one caller can claim a preview.
  claim(id: string): TransactionPreview | undefined;
  release(id: string): TransactionPreview | undefined;
  complete(id: string): TransactionPreview | undefined;
}

export type InMemoryPreviewStoreOptions = {
  maxPreviews?: number;
};

export class InMemoryPreviewStore implements PreviewStore {
  private readonly previews = new Map<string, TransactionPreview>();
  private readonly maxPreviews: number;

  constructor(options: InMemoryPreviewStoreOptions = {}) {
    this.maxPreviews = options.maxPreviews ?? 1000;
  }

  create(preview: TransactionPreview): void {
    if (this.previews.size >= this.maxPreviews) {
      throw new PreviewStoreFullError();
    }
    this.previews.set(preview.id, preview);
  }

  pruneExpired(isExpired: (preview: TransactionPreview) => boolean): number {
    let removed = 0;
    for (const [id, preview] of this.previews) {
      if (isExpired(preview)) {
        this.previews.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.previews.size;
  }

  get(id: string): TransactionPreview | undefined {
    return this.previews.get(id);
  }

  save(preview: TransactionPreview): void {
    this.previews.set(preview.id, preview);
  }

  claim(id: string): TransactionPreview | undefined {
    const preview = this.previews.get(id);
    if (!preview || preview.state !== 'pending') {
      return undefined;
    }
    const claimed: TransactionPreview = { ...preview, state: 'confirming' };
    this.previews.set(id, claimed);
    return claimed;
  }

  release(id: string): TransactionPreview | undefined {
    const preview = this.previews.get(id);
    if (!preview || preview.state !== 'confirming') {
      return undefined;
    }
    const released: TransactionPreview = { ...preview, state: 'pending' };
    this.previews.set(id, released);
    return released;
  }

  complete(id: string): TransactionPreview | undefined {
    const preview = this.previews.get(id);
    if (!preview || preview.state !== 'confirming') {
      return undefined;
    }
    const completed: TransactionPreview = { ...preview, state: 'confirmed' };
    this.previews.set(id, completed);
    return completed;
  }
}
