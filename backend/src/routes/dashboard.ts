import { Router } from 'express';
import { transactionController } from '../controllers/transactionController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.use(asyncHandler(authenticate));

router.get('/summary', asyncHandler(transactionController.dashboardSummaryHandler));

export default router;
