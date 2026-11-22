import { Router } from 'express';
import { dashboardSummaryHandler } from '../controllers/transactionController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/summary', asyncHandler(dashboardSummaryHandler));

export default router;
