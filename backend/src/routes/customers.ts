import { Router } from 'express';
import { createCustomerHandler, deleteCustomerHandler, getCustomerDetailHandler, getCustomerTransactionsHandler, listCustomersHandler, updateCustomerHandler } from '../controllers/customerController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createCustomerSchema, customerIdParamSchema, updateCustomerSchema } from '../schemas/customer.js';

const router = Router();

router.get('/', asyncHandler(listCustomersHandler));
router.post('/', validate(createCustomerSchema, 'body'), asyncHandler(createCustomerHandler));
router.get('/:id/transactions', validate(customerIdParamSchema, 'params'), asyncHandler(getCustomerTransactionsHandler));
router.get('/:id', validate(customerIdParamSchema, 'params'), asyncHandler(getCustomerDetailHandler));
router.patch('/:id', validate(customerIdParamSchema, 'params'), validate(updateCustomerSchema, 'body'), asyncHandler(updateCustomerHandler));
router.delete('/:id', validate(customerIdParamSchema, 'params'), asyncHandler(deleteCustomerHandler));

export default router;
