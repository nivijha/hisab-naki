import { Router } from 'express';
import {
  loginHandler,
  logoutHandler,
  membershipsHandler,
  registerHandler,
  sessionHandler,
} from '../controllers/authController.js';
import { prototypeSignupHandler } from '../controllers/prototypeSignupController.js';
import { resendSignupCodeHandler, verifySignupCodeHandler } from '../controllers/signupController.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import {
  loginRateLimiter,
  prototypeSignupRateLimiter,
  signupResendRateLimiter,
  signupVerifyRateLimiter,
} from '../middleware/rateLimit.js';
import { loginSchema, prototypeSignupSchema, registerSchema } from '../schemas/auth.js';
import { resendSignupCodeSchema, verifySignupCodeSchema } from '../schemas/signup.js';

const router = Router();

router.post('/login', csrfProtection, loginRateLimiter, validate(loginSchema, 'body'), asyncHandler(loginHandler));
router.post(
  '/register',
  csrfProtection,
  loginRateLimiter,
  validate(registerSchema, 'body'),
  asyncHandler(registerHandler)
);
router.post(
  '/signup',
  csrfProtection,
  prototypeSignupRateLimiter,
  validate(prototypeSignupSchema, 'body'),
  asyncHandler(prototypeSignupHandler)
);
router.post(
  '/register/resend',
  csrfProtection,
  signupResendRateLimiter,
  validate(resendSignupCodeSchema, 'body'),
  asyncHandler(resendSignupCodeHandler)
);
router.post(
  '/register/verify',
  csrfProtection,
  signupVerifyRateLimiter,
  validate(verifySignupCodeSchema, 'body'),
  asyncHandler(verifySignupCodeHandler)
);
router.get('/session', asyncHandler(authenticateToken), asyncHandler(sessionHandler));
router.post('/logout', csrfProtection, asyncHandler(logoutHandler));
router.get('/memberships', asyncHandler(authenticateToken), asyncHandler(membershipsHandler));

export default router;
