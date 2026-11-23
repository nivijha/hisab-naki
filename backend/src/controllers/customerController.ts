import type { Request, Response } from 'express';
import {
  deleteCustomer,
  ensureCustomer,
  getCustomerById,
  getCustomerTransactions,
  getCustomersForBusiness,
  updateCustomer,
} from '../services/ledger/customerService.js';
import { requireAuth } from '../middleware/authenticate.js';

export type CustomerControllerServices = {
  ensureCustomer: typeof ensureCustomer;
  getCustomersForBusiness: typeof getCustomersForBusiness;
  getCustomerById: typeof getCustomerById;
  getCustomerTransactions: typeof getCustomerTransactions;
  updateCustomer: typeof updateCustomer;
  deleteCustomer: typeof deleteCustomer;
};

const defaultServices: CustomerControllerServices = {
  ensureCustomer,
  getCustomersForBusiness,
  getCustomerById,
  getCustomerTransactions,
  updateCustomer,
  deleteCustomer,
};

export function createCustomerController(services: CustomerControllerServices = defaultServices) {
  async function listCustomersHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const customers = await services.getCustomersForBusiness(businessId);
      return res.json({ ok: true, data: customers });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load customers.' });
    }
  }

  async function getCustomerDetailHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const customer = await services.getCustomerById(businessId, customerId);

      if (!customer) {
        return res.status(404).json({ ok: false, message: 'Customer not found.' });
      }

      return res.json({ ok: true, data: customer });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load customer details.' });
    }
  }

  async function getCustomerTransactionsHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const customer = await services.getCustomerTransactions(businessId, customerId);

      if (!customer) {
        return res.status(404).json({ ok: false, message: 'Customer not found.' });
      }

      return res.json({ ok: true, data: customer });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to load transactions.' });
    }
  }

  async function createCustomerHandler(req: Request, res: Response) {
    try {
      const { businessId, userId } = requireAuth(req);
      const { name, phone } = req.body ?? {};

      if (!name) {
        return res.status(400).json({ ok: false, message: 'Customer name is required.' });
      }

      const customer = await services.ensureCustomer(
        businessId,
        userId,
        String(name),
        phone ? String(phone) : undefined
      );
      return res.status(201).json({ ok: true, data: customer });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to create customer.' });
    }
  }

  async function updateCustomerHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const result = await services.updateCustomer(businessId, customerId, req.body ?? {});

      if (!result.ok) {
        if (result.code === 'NOT_FOUND') {
          return res.status(404).json({ ok: false, message: result.message });
        }
        return res.status(400).json({ ok: false, message: result.message });
      }

      return res.json({ ok: true, data: result.customer });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to update customer.' });
    }
  }

  async function deleteCustomerHandler(req: Request, res: Response) {
    try {
      const { businessId } = requireAuth(req);
      const customerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const result = await services.deleteCustomer(businessId, customerId);

      if (!result.ok) {
        return res.status(404).json({ ok: false, message: result.message });
      }

      return res.json({ ok: true, data: { id: customerId } });
    } catch {
      return res.status(500).json({ ok: false, message: 'Unable to delete customer.' });
    }
  }

  return {
    listCustomersHandler,
    getCustomerDetailHandler,
    getCustomerTransactionsHandler,
    createCustomerHandler,
    updateCustomerHandler,
    deleteCustomerHandler,
  };
}

export const customerController = createCustomerController();
