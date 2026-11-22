import { describe, it } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import type { Server } from 'node:http';
import customerRoutes from '../../routes/customers.js';
import transactionRoutes from '../../routes/transactions.js';
import dashboardRoutes from '../../routes/dashboard.js';
import previewRoutes from '../../routes/preview.js';
import authRoutes from '../../routes/auth.js';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler.js';

async function withApp(
  mount: (app: express.Express) => void,
  run: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  mount(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('business routes require authentication', () => {
  it('GET /api/customers without token returns 401', async () => {
    await withApp((app) => app.use('/api/customers', customerRoutes), async (base) => {
      const res = await fetch(`${base}/api/customers`);
      assert.strictEqual(res.status, 401);
      assert.strictEqual((await res.json() as { ok: boolean }).ok, false);
    });
  });

  it('POST /api/transactions without token returns 401', async () => {
    await withApp((app) => app.use('/api/transactions', transactionRoutes), async (base) => {
      const res = await fetch(`${base}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: 'Raju', amount: 100, type: 'CREDIT' }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  it('GET /api/dashboard/summary without token returns 401', async () => {
    await withApp((app) => app.use('/api/dashboard', dashboardRoutes), async (base) => {
      const res = await fetch(`${base}/api/dashboard/summary`);
      assert.strictEqual(res.status, 401);
    });
  });

  it('POST /api/preview/:id/confirm without token returns 401', async () => {
    await withApp((app) => app.use('/api/preview', previewRoutes), async (base) => {
      const res = await fetch(`${base}/api/preview/preview-1/confirm`, { method: 'POST' });
      assert.strictEqual(res.status, 401);
    });
  });

  it('auth login remains public (validation error, not 401)', async () => {
    await withApp((app) => app.use('/api/auth', authRoutes), async (base) => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  it('auth memberships requires token-only auth (401)', async () => {
    await withApp((app) => app.use('/api/auth', authRoutes), async (base) => {
      const res = await fetch(`${base}/api/auth/memberships`);
      assert.strictEqual(res.status, 401);
    });
  });
});
