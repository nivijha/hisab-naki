import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { createCustomerSchema, customerIdParamSchema, updateCustomerSchema } from '../schemas/customer.js';

const router = Router();

router.use(asyncHandler(authenticate));

router.get('/', asyncHandler(customerController.listCustomersHandler));
router.post('/', validate(createCustomerSchema, 'body'), asyncHandler(customerController.createCustomerHandler));
router.get('/:id/transactions', validate(customerIdParamSchema, 'params'), asyncHandler(customerController.getCustomerTransactionsHandler));
router.get('/:id', validate(customerIdParamSchema, 'params'), asyncHandler(customerController.getCustomerDetailHandler));
router.patch('/:id', validate(customerIdParamSchema, 'params'), validate(updateCustomerSchema, 'body'), asyncHandler(customerController.updateCustomerHandler));
router.delete('/:id', validate(customerIdParamSchema, 'params'), asyncHandler(customerController.deleteCustomerHandler));

export default router;
