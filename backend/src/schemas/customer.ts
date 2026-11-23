import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required.'),
  phone: z.string().optional(),
});

export const customerIdParamSchema = z.object({
  id: z.string().min(1, 'Customer ID is required.'),
});

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'Customer name is required.').optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.name !== undefined || data.phone !== undefined, {
    message: 'At least one field (name or phone) is required.',
  });
