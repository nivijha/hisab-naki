import { z } from 'zod';

const readIntents = [
  'GET_BALANCE',
  'GET_TOTAL_OUTSTANDING',
  'GET_TODAY_TRANSACTIONS',
  'GET_CUSTOMER_TRANSACTIONS',
] as const;

type ReadIntent = (typeof readIntents)[number];

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
    customerName: z.string().min(1).optional(),
    amount: z
      .preprocess(
        (val) => (typeof val === 'string' ? Number(val) : val),
        z.number().positive('Amount must be greater than zero.')
      )
      .optional(),
    description: z.string().optional(),
    type: z.enum(['CREDIT', 'PAYMENT', 'SALE', 'EXPENSE']).optional(),
  })
  .superRefine((data, ctx) => {
    const isReadIntent = data.intent ? readIntents.includes(data.intent as ReadIntent) : false;

    if (!isReadIntent) {
      if (!data.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Customer name is required for a ledger update.',
          path: ['customerName'],
        });
      }

      if (data.amount === undefined || data.amount === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Amount is required for a ledger update.',
          path: ['amount'],
        });
      }

      if (!data.type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Transaction type is required for a ledger update.',
          path: ['type'],
        });
      }
    }
  });
