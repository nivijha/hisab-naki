import { Router } from 'express';
import { dashboardSummaryHandler } from '../controllers/transactionController.js';

const router = Router();

router.get('/summary', dashboardSummaryHandler);

export default router;
