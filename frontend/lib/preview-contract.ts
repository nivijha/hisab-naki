import { readInrAmount } from './inr';

export type PreviewType = 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';

export type TransactionPreview = {
  id: string;
  businessId: string;
  intent: string;
  customerName?: string;
  amount?: number;
  type?: PreviewType;
  description?: string;
  confidence: number;
  missingFields: string[];
  readyForConfirmation: boolean;
  state: 'pending' | 'confirming' | 'confirmed' | 'cancelled';
  createdAt: string;
};

const writeTypes = new Set<PreviewType>(['CREDIT', 'PAYMENT', 'SALE', 'EXPENSE']);
const intentType: Record<string, PreviewType> = {
  ADD_CREDIT: 'CREDIT', RECORD_PAYMENT: 'PAYMENT', ADD_SALE: 'SALE', ADD_EXPENSE: 'EXPENSE',
};
const intents = new Set([
  'ADD_CREDIT', 'RECORD_PAYMENT', 'ADD_SALE', 'ADD_EXPENSE',
  'GET_BALANCE', 'GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS', 'GET_CUSTOMER_TRANSACTIONS',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTransactionPreview(value: unknown, expectedBusinessId: string): TransactionPreview | null {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || value.businessId !== expectedBusinessId
    || typeof value.intent !== 'string' || !intents.has(value.intent)
    || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1
    || !Array.isArray(value.missingFields) || !value.missingFields.every(field => typeof field === 'string')
    || typeof value.readyForConfirmation !== 'boolean'
    || !['pending', 'confirming', 'confirmed', 'cancelled'].includes(String(value.state))
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return null;

  if (value.customerName !== undefined && value.customerName !== null && typeof value.customerName !== 'string') return null;
  if (value.amount !== undefined && value.amount !== null
    && (typeof value.amount !== 'number' || value.amount <= 0 || readInrAmount(value.amount) === null)) return null;
  if (value.type !== undefined && value.type !== null && (typeof value.type !== 'string' || !writeTypes.has(value.type as PreviewType))) return null;
  if (value.description !== undefined && value.description !== null && typeof value.description !== 'string') return null;
  const expectedType = intentType[value.intent];
  if ((expectedType && value.type !== undefined && value.type !== null && value.type !== expectedType)
    || (!expectedType && value.type !== undefined && value.type !== null)) return null;
  if (value.readyForConfirmation && (!expectedType || value.type !== expectedType || typeof value.amount !== 'number'
    || !value.customerName || value.missingFields.length > 0 || value.confidence <= 0)) return null;

  return {
    id: value.id,
    businessId: value.businessId,
    intent: value.intent,
    ...(typeof value.customerName === 'string' ? { customerName: value.customerName } : {}),
    ...(typeof value.amount === 'number' ? { amount: value.amount } : {}),
    ...(typeof value.type === 'string' && writeTypes.has(value.type as PreviewType) ? { type: value.type as PreviewType } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    confidence: value.confidence,
    missingFields: value.missingFields,
    readyForConfirmation: value.readyForConfirmation,
    state: value.state as TransactionPreview['state'],
    createdAt: value.createdAt,
  };
}

export function isSupportedPreviewWrite(preview: TransactionPreview): boolean {
  return ['ADD_CREDIT', 'RECORD_PAYMENT', 'ADD_SALE', 'ADD_EXPENSE'].includes(preview.intent)
    && preview.confidence > 0
    && preview.type !== undefined
    && preview.readyForConfirmation
    && preview.state === 'pending'
    && preview.missingFields.length === 0
    && (preview.intent === 'ADD_SALE' || preview.intent === 'ADD_EXPENSE' || Boolean(preview.customerName))
    && typeof preview.amount === 'number' && Number.isFinite(preview.amount) && preview.amount > 0;
}

