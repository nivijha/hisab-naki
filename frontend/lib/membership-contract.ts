export type MembershipRole = 'OWNER' | 'ADMIN' | 'STAFF';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type BusinessMembership = {
  membershipId: string;
  businessId: string;
  businessName: string;
  role: MembershipRole;
  status: MembershipStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseActiveMemberships(value: unknown): BusinessMembership[] {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) {
    throw new Error('Membership response is incomplete.');
  }

  const roles: MembershipRole[] = ['OWNER', 'ADMIN', 'STAFF'];
  const statuses: MembershipStatus[] = ['ACTIVE', 'SUSPENDED', 'REMOVED'];
  const parsed: BusinessMembership[] = [];
  for (const row of value.data) {
    if (!isRecord(row)
      || typeof row.membershipId !== 'string' || !row.membershipId.trim()
      || typeof row.businessId !== 'string' || !row.businessId.trim()
      || typeof row.businessName !== 'string' || !row.businessName.trim()
      || typeof row.role !== 'string' || !roles.includes(row.role as MembershipRole)
      || typeof row.status !== 'string' || !statuses.includes(row.status as MembershipStatus)) {
      throw new Error('Membership response is incomplete.');
    }
    parsed.push({
      membershipId: row.membershipId,
      businessId: row.businessId,
      businessName: row.businessName,
      role: row.role as MembershipRole,
      status: row.status as MembershipStatus,
    });
  }
  return parsed.filter(membership => membership.status === 'ACTIVE');
}
