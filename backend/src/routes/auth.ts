import { Router } from 'express';
import {
  loginHandler,
  membershipsHandler,
  registerHandler,
} from '../controllers/authController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { loginSchema, registerSchema } from '../schemas/auth.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema, 'body'), asyncHandler(loginHandler));
router.post(
  '/register',
  loginRateLimiter,
  validate(registerSchema, 'body'),
  asyncHandler(registerHandler)
);
router.get('/memberships', asyncHandler(authenticateToken), asyncHandler(membershipsHandler));

export default router;
