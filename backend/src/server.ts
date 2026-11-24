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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getJwtSecret } from './services/auth/tokenService.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const isProduction = process.env.NODE_ENV === 'production';

function assertStartupEnvironment(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required to start the backend.');
  }

  if (isProduction) {
    const configuredOrigin = process.env.CORS_ORIGIN;
    if (!configuredOrigin || configuredOrigin === '*') {
      throw new Error('CORS_ORIGIN must be set to a specific frontend origin in production.');
    }
    getJwtSecret(); // Fails startup when the JWT secret is missing or shorter than 32 characters.
  }
}

assertStartupEnvironment();

const app = express();
const port = Number(process.env.PORT ?? 4000);

const corsOrigin = process.env.CORS_ORIGIN ?? '*';

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-business-id'],
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
app.use('/api/preview', previewRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`HisabNaki backend running on http://localhost:${port}`);
});
