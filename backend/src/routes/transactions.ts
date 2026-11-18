import { Router } from 'express';
import { createTransactionHandler, dashboardSummaryHandler, listTransactionsHandler } from '../controllers/transactionController.js';

const router = Router();

router.post('/', createTransactionHandler);
router.get('/', listTransactionsHandler);
router.get('/summary', dashboardSummaryHandler);

export default router;
