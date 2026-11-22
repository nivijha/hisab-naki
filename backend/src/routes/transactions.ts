import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { transactionController } from '../controllers/transactionController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
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

router.use(asyncHandler(authenticate));

router.post('/', validate(createTransactionSchema, 'body'), asyncHandler(transactionController.createTransactionHandler));
router.get(
  '/',
  detectHistoryQuery,
  validate(listTransactionsQuerySchema, 'query'),
  asyncHandler(transactionController.listTransactionsHandler)
);
router.get('/summary', asyncHandler(transactionController.dashboardSummaryHandler));
router.get('/:id', validate(transactionIdParamSchema, 'params'), asyncHandler(transactionController.getTransactionByIdHandler));

export default router;
