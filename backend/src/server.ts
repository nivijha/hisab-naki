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
import { PrismaSignupRepository } from './services/auth/signupService.js';
import { logger } from './utils/logger.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 4000);

const configuredOrigin = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === 'production' && (!configuredOrigin || configuredOrigin === '*')) {
  throw new Error('CORS_ORIGIN must be set to a specific frontend origin in production.');
}
const corsOrigin = configuredOrigin ?? '*';

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-business-id', 'Idempotency-Key'],
  })
);
app.use(express.json());

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
