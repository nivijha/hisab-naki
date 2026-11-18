import type { Request, Response } from 'express';
import { ensureDefaultUser } from '../services/ledger/customerService.js';
import {
  createTransaction,
  getCustomerBalanceForName,
  getDashboardSummary,
  getTotalOutstandingForUser,
  getTransactionsForUser,
} from '../services/ledger/transactionService.js';

export async function createTransactionHandler(req: Request, res: Response) {
  try {
    const { intent, customerName, amount, description, type } = req.body ?? {};

    if (intent === 'GET_BALANCE' && customerName) {
      const user = await ensureDefaultUser();
      const balance = await getCustomerBalanceForName(user.id, String(customerName));

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
      const user = await ensureDefaultUser();
      const total = await getTotalOutstandingForUser(user.id);
      return res.json({
        ok: true,
        data: total,
        responseText: `Total outstanding ${total.totalOutstandingText} hai.`,
      });
    }

    if (intent === 'GET_TODAY_TRANSACTIONS') {
      const user = await ensureDefaultUser();
      const transactions = await getTransactionsForUser(user.id);
      const today = transactions.filter((transaction) => {
        const date = new Date(transaction.createdAt);
        const todayDate = new Date();
        return date.toDateString() === todayDate.toDateString();
      });
      return res.json({ ok: true, data: today, responseText: `Aaj ke transactions dikha diye gaye hain.` });
    }

    if (intent === 'GET_CUSTOMER_TRANSACTIONS' && customerName) {
      const user = await ensureDefaultUser();
      const customer = await (await import('../services/ledger/customerService.js')).getCustomerByName(user.id, String(customerName));
      if (!customer) {
        return res.status(404).json({ ok: false, message: 'Customer not found.' });
      }
      return res.json({ ok: true, data: customer.transactions, responseText: `${customer.name} ke transactions loaded.` });
    }

    if (!customerName || !amount || !type) {
      return res.status(400).json({ ok: false, message: 'Customer name, amount and type are required for a ledger update.' });
    }

    const transactionTypeMap = {
      ADD_CREDIT: 'CREDIT',
      RECORD_PAYMENT: 'PAYMENT',
      ADD_SALE: 'SALE',
      ADD_EXPENSE: 'EXPENSE',
    } as const;

    const resolvedType = (type ?? transactionTypeMap[intent as keyof typeof transactionTypeMap]) as 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';

    const row = await createTransaction({
      customerName: String(customerName),
      amount: Number(amount),
      type: resolvedType,
      description: description ? String(description) : 'Ledger update',
    });

    return res.status(201).json({
      ok: true,
      data: row,
      responseText: `${row.customer.name} ke account mein ${row.outstandingBalance} ka balance hai.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not process the transaction.';
    return res.status(500).json({ ok: false, message });
  }
}

export async function listTransactionsHandler(_req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const transactions = await getTransactionsForUser(user.id);
    res.json({ ok: true, data: transactions });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Unable to load transactions.' });
  }
}

export async function dashboardSummaryHandler(_req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const summary = await getDashboardSummary(user.id);
    res.json({ ok: true, data: summary });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Unable to load dashboard data.' });
  }
}
