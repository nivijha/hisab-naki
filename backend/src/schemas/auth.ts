import { z } from 'zod';
import { optionalPhoneSchema, phoneSchema } from './signup.js';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Identifier is required.'),
  password: z.string().min(1, 'Password is required.'),
});

/**
 * Prototype (MVP) registration schema: name, email, optional phone and
 * password. Passwords are hashed server-side; phone verification is not
 * part of the MVP flow. The phone-verified OTP flow remains available via
 * /api/auth/register/resend and /api/auth/register/verify.
 */
export const prototypeSignupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100, 'Name must be 100 characters or fewer.'),
  email: z.string().trim().email('Enter a valid email address.').max(255, 'Email is too long.'),
  phone: optionalPhoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password must be 128 characters or fewer.'),
}).strict();

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name cannot exceed 100 characters.'),
  email: z.string().trim().email('Enter a valid email address.').max(255, 'Email is too long.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.'),
  businessName: z
    .string()
    .trim()
    .min(1, 'Business name is required.')
    .max(100, 'Business name cannot exceed 100 characters.'),
  phone: optionalPhoneSchema,
});
