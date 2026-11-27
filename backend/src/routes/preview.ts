import { Router } from 'express';
import { previewController } from '../controllers/previewController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { createPreviewCustomerSchema, createPreviewSchema, previewIdParamSchema, resolvePreviewCustomerSchema } from '../schemas/preview.js';

const router = Router();

router.use(asyncHandler(authenticate));

router.post('/', validate(createPreviewSchema, 'body'), asyncHandler(previewController.createPreviewHandler));
router.get('/:id', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.getPreviewHandler));
router.post('/:id/cancel', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.cancelPreviewHandler));
router.post('/:id/resolve-customer', validate(previewIdParamSchema, 'params'), validate(resolvePreviewCustomerSchema, 'body'), asyncHandler(previewController.resolveCustomerHandler));
router.post('/:id/create-customer', validate(previewIdParamSchema, 'params'), validate(createPreviewCustomerSchema, 'body'), asyncHandler(previewController.createCustomerHandler));
router.post('/:id/confirm', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.confirmPreviewHandler));

export default router;
