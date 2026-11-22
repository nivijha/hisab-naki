import type { Request, Response } from 'express';
import { getCustomerByName } from '../services/ledger/customerService.js';
import { getDashboardSummary } from '../services/dashboard/dashboardService.js';
import {
  createTransaction,
  getCustomerBalanceForName,
  getTotalOutstandingForUser,
  getTransactionById,
  getTransactionHistory,
  getTransactionsForUser,
} from '../services/ledger/transactionService.js';
import { HttpError, requireAuth } from '../middleware/authenticate.js';
import { logger } from '../utils/logger.js';

export type TransactionControllerServices = {
  createTransaction: typeof createTransaction;
  getCustomerBalanceForName: typeof getCustomerBalanceForName;
  getTotalOutstandingForUser: typeof getTotalOutstandingForUser;
  getTransactionById: typeof getTransactionById;
  getTransactionHistory: typeof getTransactionHistory;
  getTransactionsForUser: typeof getTransactionsForUser;
  getCustomerByName: typeof getCustomerByName;
  getDashboardSummary: typeof getDashboardSummary;
};

const defaultServices: TransactionControllerServices = {
  createTransaction,
  getCustomerBalanceForName,
  getTotalOutstandingForUser,
  getTransactionById,
  getTransactionHistory,
  getTransactionsForUser,
  getCustomerByName,
  getDashboardSummary,
};

export function createTransactionController(
  services: TransactionControllerServices = defaultServices
) {
  async function createTransactionHandler(req: Request, res: Response) {
    try {
      const { businessId, userId } = requireAuth(req);
      const { intent, customerName, amount, description, type, idempotencyKey } = req.body ?? {};

      if (intent === 'GET_BALANCE' && customerName) {
        const balance = await services.getCustomerBalanceForName(businessId, String(customerName));
        if (!balance) {
          return res.status(404).json({ ok: false, message: 'Customer not found.' });
        }
        return res.json({
          ok: true,
          data: balance,
          responseText: `${balance.customerName} ke ${balance.outstandingBalance} baaki hain.`,
        });
      }

      if (intent === 'GET_TOTAL_OUTSTANDING') {
        const total = await services.getTotalOutstandingForUser(businessId);
        return res.json({
          ok: true,
          data: total,
          responseText: `Total outstanding ${total.totalOutstandingText} hai.`,
        });
      }

      if (intent === 'GET_TODAY_TRANSACTIONS') {
        const transactions = await services.getTransactionsForUser(businessId);
        const today = transactions.filter((transaction) => {
          const date = new Date(transaction.createdAt);
          return date.toDateString() === new Date().toDateString();
        });
        return res.json({ ok: true, data: today, responseText: 'Aaj ke transactions dikha diye gaye hain.' });
      }

      if (intent === 'GET_CUSTOMER_TRANSACTIONS' && customerName) {
        const customer = await services.getCustomerByName(businessId, String(customerName));
        if (!customer) {
          return res.status(404).json({ ok: false, message: 'Customer not found.' });
        }
        return res.json({
          ok: true,
          data: customer.transactions,
          responseText: `${customer.name} ke transactions loaded.`,
        });
      }

      if (!customerName || !amount || !type) {
        return res.status(400).json({
          ok: false,
          message: 'Customer name, amount and type are required for a ledger update.',
        });
      }

      const transactionTypeMap = {
        ADD_CREDIT: 'CREDIT',
        RECORD_PAYMENT: 'PAYMENT',
        ADD_SALE: 'SALE',
        ADD_EXPENSE: 'EXPENSE',
      } as const;
      const resolvedType = (type ?? transactionTypeMap[intent as keyof typeof transactionTypeMap]) as
        | 'CREDIT'
        | 'PAYMENT'
        | 'SALE'
        | 'EXPENSE';

      const row = await services.createTransaction({
        businessId,
        createdByUserId: userId,
        customerName: String(customerName).trim(),
        amount: Number(amount),
        type: resolvedType,
        description: description ? String(description) : 'Ledger update',
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      });

      return res.status(201).json({
        ok: true,
        data: row,
        responseText: `${row.customer.name} ke account mein ${row.outstandingBalance} ka balance hai.`,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ ok: false, message: error.message });
      }
      logger.error('transaction.create_failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return res.status(500).json({ ok: false, message: 'Could not process the transaction.' });
    }
  }

  async function listTransactionsHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const requested = (req as Request & { historyQueryRequested?: boolean }).historyQueryRequested;

      if (requested) {
        const query = req.query as {
          page?: number;
          limit?: number;
          type?: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';
          customerId?: string;
          from?: Date;
          to?: Date;
        };
        const result = await services.getTransactionHistory(businessId, query);
        return res.json({ ok: true, data: result });
      }

      const transactions = await services.getTransactionsForUser(businessId);
      return res.json({ ok: true, data: transactions });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load transactions.' });
    }
  }

  async function getTransactionByIdHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const transactionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const transaction = await services.getTransactionById(businessId, transactionId);

      if (!transaction) {
        return res.status(404).json({ ok: false, message: 'Transaction not found.' });
      }

      return res.json({ ok: true, data: transaction });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load transaction.' });
    }
  }

  async function dashboardSummaryHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const summary = await services.getDashboardSummary(businessId);
      return res.json({ ok: true, data: summary });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load dashboard data.' });
    }
  }

  return {
    createTransactionHandler,
    listTransactionsHandler,
    getTransactionByIdHandler,
    dashboardSummaryHandler,
  };
}

export const transactionController = createTransactionController();
