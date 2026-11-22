import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createTransactionHandler, dashboardSummaryHandler, getTransactionByIdHandler, listTransactionsHandler } from '../controllers/transactionController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createTransactionSchema, listTransactionsQuerySchema, transactionIdParamSchema } from '../schemas/transaction.js';

const HISTORY_QUERY_KEYS = ['page', 'limit', 'type', 'customerId', 'from', 'to'];

function detectHistoryQuery(req: Request, _res: Response, next: NextFunction) {
  const withFlag = req as Request & { historyQueryRequested?: boolean };
  withFlag.historyQueryRequested = HISTORY_QUERY_KEYS.some(
    (key) => req.query[key] !== undefined
  );
  next();
}

const router = Router();

router.post('/', validate(createTransactionSchema, 'body'), asyncHandler(createTransactionHandler));
router.get(
  '/',
  detectHistoryQuery,
  validate(listTransactionsQuerySchema, 'query'),
  asyncHandler(listTransactionsHandler)
);
router.get('/summary', asyncHandler(dashboardSummaryHandler));
router.get('/:id', validate(transactionIdParamSchema, 'params'), asyncHandler(getTransactionByIdHandler));

export default router;
