import { Router } from 'express';
import { loginHandler, membershipsHandler } from '../controllers/authController.js';
import { registerHandler, resendSignupCodeHandler, verifySignupCodeHandler } from '../controllers/signupController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { loginRateLimiter, signupRateLimiter, signupResendRateLimiter, signupVerifyRateLimiter } from '../middleware/rateLimit.js';
import { loginSchema } from '../schemas/auth.js';
import { registerSchema, resendSignupCodeSchema, verifySignupCodeSchema } from '../schemas/signup.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema, 'body'), asyncHandler(loginHandler));
router.post('/register', signupRateLimiter, validate(registerSchema, 'body'), asyncHandler(registerHandler));
router.post('/register/resend', signupResendRateLimiter, validate(resendSignupCodeSchema, 'body'), asyncHandler(resendSignupCodeHandler));
router.post('/register/verify', signupVerifyRateLimiter, validate(verifySignupCodeSchema, 'body'), asyncHandler(verifySignupCodeHandler));
router.get('/memberships', asyncHandler(authenticateToken), asyncHandler(membershipsHandler));

export default router;
