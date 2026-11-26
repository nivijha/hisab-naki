const decimalAmount = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

// At 2^46 rupees, adjacent JavaScript numbers are more than one paise apart.
// Larger exact amounts must arrive as decimal strings.
export function readInrAmount(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) >= 2 ** 46) return null;
    value = String(value);
  }
  return typeof value === 'string' && decimalAmount.test(value) ? value : null;
}

export function formatInrAmount(value: unknown): string {
  const text = readInrAmount(value);
  if (text === null) return '—';

  const [, sign, whole, fraction = ''] = decimalAmount.exec(text)!;
  const paise = fraction.padEnd(2, '0');
  if (whole === '0' && paise === '00') return '₹0';

  const grouped = whole.replace(/\B(?=(?:\d{2})*\d{3}$)/g, ',');
  return `${sign}₹${grouped}${paise === '00' ? '' : `.${paise}`}`;
}
