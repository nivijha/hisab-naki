export function normalizeLoginIdentifier(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (trimmed.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(`+${digits}`)) return `+${digits}`;

  return trimmed;
}
