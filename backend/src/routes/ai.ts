import { Router } from 'express';
import { interpretHandler } from '../controllers/aiController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { aiRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/interpret', aiRateLimiter, asyncHandler(interpretHandler));

export default router;
