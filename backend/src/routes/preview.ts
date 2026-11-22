import { Router } from 'express';
import { previewController } from '../controllers/previewController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { createPreviewSchema, previewIdParamSchema } from '../schemas/preview.js';

const router = Router();

router.use(asyncHandler(authenticate));

router.post('/', validate(createPreviewSchema, 'body'), asyncHandler(previewController.createPreviewHandler));
router.get('/:id', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.getPreviewHandler));
router.post('/:id/cancel', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.cancelPreviewHandler));
router.post('/:id/confirm', validate(previewIdParamSchema, 'params'), asyncHandler(previewController.confirmPreviewHandler));

export default router;
