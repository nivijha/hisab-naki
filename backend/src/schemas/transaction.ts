import { z } from 'zod';

const readIntents = [
  'GET_BALANCE',
  'GET_TOTAL_OUTSTANDING',
  'GET_TODAY_TRANSACTIONS',
  'GET_CUSTOMER_TRANSACTIONS',
] as const;

const writeIntentToType = {
  ADD_CREDIT: 'CREDIT',
  RECORD_PAYMENT: 'PAYMENT',
  ADD_SALE: 'SALE',
  ADD_EXPENSE: 'EXPENSE',
} as const;

type ReadIntent = (typeof readIntents)[number];
type WriteIntent = keyof typeof writeIntentToType;
type WriteType =
  | (typeof writeIntentToType)[WriteIntent]
  | 'OPENING_BALANCE'
  | 'SALE_RETURN'
  | 'REFUND';

function hasAtMostTwoDecimals(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const text = String(value);
  if (text.includes('e') || text.includes('E')) return false;
  const dot = text.indexOf('.');
  return dot === -1 ? true : text.length - dot - 1 <= 2;
}

export const transactionIdParamSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required.'),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive('Page must be a positive integer.').optional(),
  limit: z.coerce
    .number()
    .int()
    .positive('Limit must be a positive integer.')
    .max(100, 'Limit cannot exceed 100.')
    .optional(),
  type: z.enum(['CREDIT', 'PAYMENT', 'SALE', 'EXPENSE']).optional(),
  customerId: z.string().min(1, 'Customer ID cannot be empty.').optional(),
  from: z.coerce.date({ invalid_type_error: 'from must be a valid date.' }).optional(),
  to: z.coerce.date({ invalid_type_error: 'to must be a valid date.' }).optional(),
});

const transactionTypeSchema = z.enum([
  'CREDIT',
  'PAYMENT',
  'SALE',
  'EXPENSE',
  'OPENING_BALANCE',
  'SALE_RETURN',
  'REFUND',
]);
const saleModeSchema = z.enum(['CASH', 'CREDIT']);
const paymentMethodSchema = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']);
const openingDirectionSchema = z.enum(['INCREASE', 'DECREASE']);

export const createTransactionSchema = z
  .object({
    intent: z
      .enum([
        'ADD_CREDIT',
        'RECORD_PAYMENT',
        'ADD_SALE',
        'ADD_EXPENSE',
        'GET_BALANCE',
        'GET_TOTAL_OUTSTANDING',
        'GET_TODAY_TRANSACTIONS',
        'GET_CUSTOMER_TRANSACTIONS',
      ])
      .optional(),
    customerId: z.string().trim().min(1, 'Customer ID cannot be empty.').nullable().optional(),
    customerName: z.string().trim().min(1, 'Customer name cannot be empty.').nullable().optional(),
    amount: z
      .preprocess(
        (val) => (typeof val === 'string' ? Number(val) : val),
        z
          .number()
          .positive('Amount must be greater than zero.')
          .refine(hasAtMostTwoDecimals, 'Amount supports at most two decimal places.')
      )
      .optional(),
    description: z.string().nullable().optional(),
    type: transactionTypeSchema.nullable().optional(),
    saleMode: saleModeSchema.nullable().optional(),
    paymentMethod: paymentMethodSchema.nullable().optional(),
    openingDirection: openingDirectionSchema.nullable().optional(),
    originalTransactionId: z
      .string()
      .trim()
      .min(1, 'Original transaction ID cannot be empty.')
      .nullable()
      .optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(1, 'Idempotency key cannot be empty.')
      .max(200, 'Idempotency key is too long.')
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const isReadIntent = data.intent ? readIntents.includes(data.intent as ReadIntent) : false;

    if (isReadIntent) {
      return;
    }

    const inferredType = data.type ?? (data.intent ? writeIntentToType[data.intent as WriteIntent] : null);
    const type = inferredType as WriteType | null;
    const hasCustomer = Boolean(data.customerId || data.customerName);

    if (!type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transaction type is required for a ledger update.',
        path: ['type'],
      });
    }

    if (data.amount === undefined || data.amount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount is required for a ledger update.',
        path: ['amount'],
      });
    }

    if (data.originalTransactionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Linked transactions are not supported by this endpoint.',
        path: ['originalTransactionId'],
      });
    }

    if (data.openingDirection && data.type !== 'OPENING_BALANCE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'openingDirection is only valid for OPENING_BALANCE transactions.',
        path: ['openingDirection'],
      });
    }

    if (!type) {
      return;
    }

    if (data.saleMode && type !== 'SALE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'saleMode is only valid for SALE transactions.',
        path: ['saleMode'],
      });
    }

    if (type === 'OPENING_BALANCE') {
      if (!hasCustomer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Customer name or customer ID is required for OPENING_BALANCE.',
          path: ['customerName'],
        });
      }
      if (!data.openingDirection) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Required for OPENING_BALANCE transactions.',
          path: ['openingDirection'],
        });
      }
      if (data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is not valid for OPENING_BALANCE transactions.',
          path: ['paymentMethod'],
        });
      }
      return;
    }

    if (type === 'SALE_RETURN') {
      if (!hasCustomer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Customer name or customer ID is required for SALE_RETURN.',
          path: ['customerName'],
        });
      }
      if (data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is not valid for SALE_RETURN transactions.',
          path: ['paymentMethod'],
        });
      }
      return;
    }

    if (type === 'REFUND') {
      if (data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is not valid for REFUND transactions.',
          path: ['paymentMethod'],
        });
      }
      return;
    }

    if (type === 'CREDIT') {
      if (!hasCustomer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Customer name or customer ID is required for CREDIT.',
          path: ['customerName'],
        });
      }
      if (data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is not valid for CREDIT transactions.',
          path: ['paymentMethod'],
        });
      }
      return;
    }

    if (type === 'PAYMENT') {
      if (!hasCustomer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Customer name or customer ID is required for PAYMENT.',
          path: ['customerName'],
        });
      }
      if (!data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is required for PAYMENT.',
          path: ['paymentMethod'],
        });
      }
      return;
    }

    if (type === 'SALE') {
      if (!data.saleMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'saleMode is required for SALE.',
          path: ['saleMode'],
        });
        return;
      }

      if (data.saleMode === 'CASH' && !data.paymentMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'paymentMethod is required for a cash sale.',
          path: ['paymentMethod'],
        });
      }

      if (data.saleMode === 'CREDIT') {
        if (!hasCustomer) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Customer name or customer ID is required for a credit sale.',
            path: ['customerName'],
          });
        }
        if (data.paymentMethod) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'paymentMethod must not be set for a credit sale.',
            path: ['paymentMethod'],
          });
        }
      }
      return;
    }

    if (data.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'EXPENSE does not accept a customer.',
        path: ['customerId'],
      });
    }
    if (data.customerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'EXPENSE does not accept a customer.',
        path: ['customerName'],
      });
    }
    if (!data.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paymentMethod is required for EXPENSE.',
        path: ['paymentMethod'],
      });
    }
  });
