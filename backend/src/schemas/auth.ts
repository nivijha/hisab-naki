import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Identifier is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name cannot exceed 100 characters.'),
  email: z.string().trim().email('Enter a valid email address.').max(255, 'Email is too long.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.'),
  businessName: z
    .string()
    .trim()
    .min(1, 'Business name is required.')
    .max(100, 'Business name cannot exceed 100 characters.'),
  phone: z.string().trim().min(1, 'Phone cannot be empty.').max(20, 'Phone is too long.').nullable().optional(),
});
