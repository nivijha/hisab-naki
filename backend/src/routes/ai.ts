import { Router } from 'express';
import { interpretHandler } from '../controllers/aiController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/interpret', asyncHandler(interpretHandler));

export default router;
