import { z } from 'zod';

export function normalizePhoneInput(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (trimmed.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(`+${digits}`)) return `+${digits}`;
  return trimmed;
}

export const phoneSchema = z.string().trim().min(1, 'Phone number is required.')
  .transform(normalizePhoneInput)
  .refine(value => /^\+[1-9]\d{7,14}$/.test(value), 'Enter a valid phone number with country code or a 10-digit Indian mobile number.');

export const optionalPhoneSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, phoneSchema.optional());

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100, 'Name must be 100 characters or fewer.'),
  phone: phoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password must be 128 characters or fewer.'),
}).strict();

export const resendSignupCodeSchema = z.object({ phone: phoneSchema }).strict();

export const verifySignupCodeSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
}).strict();

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, 'Enter your shop name.').max(120, 'Shop name must be 120 characters or fewer.'),
}).strict();
