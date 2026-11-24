import { Router } from 'express';
import { createFirstBusinessHandler } from '../controllers/businessController.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { validate } from '../middleware/validate.js';
import { createLoginRateLimiter } from '../middleware/rateLimit.js';
import { createBusinessSchema } from '../schemas/signup.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const businessCreationRateLimiter = createLoginRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, message: 'Too many shop setup attempts. Please wait before trying again.' });

router.post('/', businessCreationRateLimiter, asyncHandler(authenticateToken), validate(createBusinessSchema, 'body'), asyncHandler(createFirstBusinessHandler));

export default router;
