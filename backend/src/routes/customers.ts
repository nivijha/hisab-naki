import { Router } from 'express';
import { createCustomerHandler, getCustomerDetailHandler, getCustomerTransactionsHandler, listCustomersHandler } from '../controllers/customerController.js';

const router = Router();

router.get('/', listCustomersHandler);
router.post('/', createCustomerHandler);
router.get('/:id/transactions', getCustomerTransactionsHandler);
router.get('/:id', getCustomerDetailHandler);

export default router;
