import { Router } from 'express';
import {
  cancelPreviewHandler,
  confirmPreviewHandler,
  createPreviewHandler,
  getPreviewHandler,
} from '../controllers/previewController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createPreviewSchema, previewIdParamSchema } from '../schemas/preview.js';

const router = Router();

router.post('/', validate(createPreviewSchema, 'body'), asyncHandler(createPreviewHandler));
router.get('/:id', validate(previewIdParamSchema, 'params'), asyncHandler(getPreviewHandler));
router.post('/:id/cancel', validate(previewIdParamSchema, 'params'), asyncHandler(cancelPreviewHandler));
router.post('/:id/confirm', validate(previewIdParamSchema, 'params'), asyncHandler(confirmPreviewHandler));

export default router;
