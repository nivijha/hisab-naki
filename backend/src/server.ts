import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'node:url';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import previewRoutes from './routes/preview.js';
import customerRoutes from './routes/customers.js';
import transactionRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import businessRoutes from './routes/businesses.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getJwtSecret } from './services/auth/tokenService.js';
import { assertOtpDeliveryEnvironment } from './services/auth/otpDelivery.js';
import { assertPrototypeSignupNotEnabledInProduction } from './services/auth/prototypeSignupService.js';
import { assertOtpHashSecretConfigured, PrismaSignupRepository } from './services/auth/signupService.js';
import { getConfiguredFrontendOrigins, getSessionCookieOptions, resolveCorsOrigin } from './services/auth/sessionCookie.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { logger } from './utils/logger.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const isProduction = process.env.NODE_ENV === 'production';

function assertStartupEnvironment(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required to start the backend.');
  }

  assertOtpDeliveryEnvironment();

  // Prototype signup (unverified password-based signup) is development-only.
  assertPrototypeSignupNotEnabledInProduction();
  getSessionCookieOptions(0);

  if (isProduction) {
    const configuredOrigin = getConfiguredFrontendOrigins();
    if (configuredOrigin.length === 0 || configuredOrigin.includes('*')) {
      throw new Error('CORS_ORIGIN must be set to a specific frontend origin in production.');
    }
    getJwtSecret(); // Fails startup when the JWT secret is missing or shorter than 32 characters.
    assertOtpHashSecretConfigured(); // Fails startup when OTP_HASH_SECRET is missing or shorter than 32 characters in production.
  }
}

assertStartupEnvironment();

const app = express();
const port = Number(process.env.PORT ?? 4000);
app.disable('x-powered-by');

app.use(
  cors({
    origin: resolveCorsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-business-id', 'Idempotency-Key'],
  })
);
app.use(express.json());
app.use('/api', csrfProtection);

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'HisabNaki backend is running' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const signupRepository = new PrismaSignupRepository();
const cleanupExpiredSignupData = () => {
  void signupRepository.cleanupExpiredSignupSecrets(new Date()).catch(() => {
    logger.warn('signup.cleanup_unavailable');
  });
};
cleanupExpiredSignupData();
const signupCleanupTimer = setInterval(cleanupExpiredSignupData, 60_000);
signupCleanupTimer.unref();

app.listen(port, () => {
  console.log(`HisabNaki backend running on http://localhost:${port}`);
});
