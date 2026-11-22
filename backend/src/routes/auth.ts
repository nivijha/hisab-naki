import { Router } from 'express';
import { loginHandler, membershipsHandler } from '../controllers/authController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { loginSchema } from '../schemas/auth.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema, 'body'), asyncHandler(loginHandler));
router.get('/memberships', asyncHandler(authenticateToken), asyncHandler(membershipsHandler));

export default router;
