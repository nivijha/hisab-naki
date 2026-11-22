import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'node:url';
import aiRoutes from './routes/ai.js';
import previewRoutes from './routes/preview.js';
import customerRoutes from './routes/customers.js';
import transactionRoutes from './routes/transactions.js';
import dashboardRoutes from './routes/dashboard.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 4000);

const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'HisabNaki backend is running' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use('/api/ai', aiRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`HisabNaki backend running on http://localhost:${port}`);
});
