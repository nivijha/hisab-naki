import type { Request, Response } from 'express';
import { deleteCustomer, ensureCustomer, ensureDefaultUser, getCustomerById, getCustomerTransactions, getCustomersForUser, updateCustomer } from '../services/ledger/customerService.js';

export async function listCustomersHandler(_req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const customers = await getCustomersForUser(user.id);
    res.json({ ok: true, data: customers });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Unable to load customers.' });
  }
}

export async function getCustomerDetailHandler(req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const customer = await getCustomerById(user.id, customerId);

    if (!customer) {
      return res.status(404).json({ ok: false, message: 'Customer not found.' });
    }

    return res.json({ ok: true, data: customer });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Unable to load customer details.' });
  }
}

export async function getCustomerTransactionsHandler(req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const customer = await getCustomerTransactions(user.id, customerId);

    if (!customer) {
      return res.status(404).json({ ok: false, message: 'Customer not found.' });
    }

    return res.json({ ok: true, data: customer });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Unable to load transactions.' });
  }
}

export async function createCustomerHandler(req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const { name, phone } = req.body ?? {};

    if (!name) {
      return res.status(400).json({ ok: false, message: 'Customer name is required.' });
    }

    const customer = await ensureCustomer(user.id, String(name), phone ? String(phone) : undefined);
    return res.status(201).json({ ok: true, data: customer });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Unable to create customer.' });
  }
}

export async function updateCustomerHandler(req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const result = await updateCustomer(user.id, customerId, req.body ?? {});

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        return res.status(404).json({ ok: false, message: result.message });
      }
      return res.status(400).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, data: result.customer });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Unable to update customer.' });
  }
}

export async function deleteCustomerHandler(req: Request, res: Response) {
  try {
    const user = await ensureDefaultUser();
    const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
    const result = await deleteCustomer(user.id, customerId);

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        return res.status(404).json({ ok: false, message: result.message });
      }
      return res.status(409).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, data: { id: customerId } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Unable to delete customer.' });
  }
}
