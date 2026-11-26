import { HttpError } from '../../middleware/authenticate.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export function normalizeOptionalPhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Enter a valid phone number.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizePhone(trimmed);
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  let normalized = trimmed;

  if (/^[6-9]\d{9}$/.test(digits)) normalized = `+91${digits}`;
  else if (/^0[6-9]\d{9}$/.test(digits)) normalized = `+91${digits.slice(1)}`;
  else if (trimmed.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(`+${digits}`)) normalized = `+${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new HttpError(400, 'Enter a valid phone number with country code or a 10-digit Indian mobile number.');
  }
  return normalized;
}
