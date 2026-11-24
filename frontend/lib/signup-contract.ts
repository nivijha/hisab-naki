export type SignupStart = { maskedPhone: string; expiresAt: string; verificationRequired: true };
export type CreatedFirstBusiness = {
  business: { id: string; name: string; currency: string };
  membership: { membershipId: string; businessId: string; role: 'OWNER'; status: 'ACTIVE' };
  replayed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseSignupStart(value: unknown): SignupStart | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const { maskedPhone, expiresAt, verificationRequired } = value.data;
  if (typeof maskedPhone !== 'string' || !maskedPhone.trim()
    || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))
    || verificationRequired !== true) return null;
  return { maskedPhone, expiresAt, verificationRequired: true };
}

export function parseResendResponse(value: unknown): string | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)
    || typeof value.data.message !== 'string' || !value.data.message.trim()) return null;
  return value.data.message;
}

export function isSignupVerified(value: unknown): boolean {
  return isRecord(value) && value.ok === true && isRecord(value.data) && value.data.verified === true;
}

export function parseCreatedFirstBusiness(value: unknown): CreatedFirstBusiness | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const { business, membership, replayed } = value.data;
  if (!isRecord(business) || !isRecord(membership)
    || typeof business.id !== 'string' || !business.id.trim()
    || typeof business.name !== 'string' || !business.name.trim()
    || typeof business.currency !== 'string' || !business.currency.trim()
    || typeof membership.membershipId !== 'string' || !membership.membershipId.trim()
    || membership.businessId !== business.id || membership.role !== 'OWNER'
    || membership.status !== 'ACTIVE' || typeof replayed !== 'boolean') return null;
  return {
    business: { id: business.id, name: business.name, currency: business.currency },
    membership: { membershipId: membership.membershipId, businessId: business.id, role: 'OWNER', status: 'ACTIVE' },
    replayed,
  };
}
