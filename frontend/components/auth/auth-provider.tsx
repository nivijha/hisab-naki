'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiClient } from '@/lib/api-client';
import { parseActiveMemberships, type BusinessMembership } from '@/lib/membership-contract';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';
export type { BusinessMembership, MembershipRole, MembershipStatus } from '@/lib/membership-contract';
export type SelectedBusiness = Pick<BusinessMembership, 'businessId' | 'businessName' | 'role' | 'membershipId'>;
export type MembershipLoadStatus = 'idle' | 'loading' | 'success' | 'error';
export type FinancialOperationStatus = 'idle' | 'pending' | 'uncertain';

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
};

type SessionResponse = {
  authenticated: true;
  user: AuthUser;
};

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  completeAuthenticatedSession: () => Promise<void>;
  logout: () => Promise<boolean>;
  memberships: BusinessMembership[];
  membershipsStatus: MembershipLoadStatus;
  membershipsError: string | null;
  businessAccessError: string | null;
  refreshMemberships: (force?: boolean) => Promise<void>;
  selectedBusiness: SelectedBusiness | null;
  businessContextGeneration: number;
  selectBusiness: (businessId: string) => boolean;
  beginBusinessSwitch: () => { ok: true } | { ok: false; message: string };
  financialOperationStatus: FinancialOperationStatus;
  setFinancialOperationStatus: (status: FinancialOperationStatus) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSessionResponse(value: unknown): SessionResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new ApiError('The server returned an invalid session response.', 'invalid-response');
  }
  const data = value.data;
  const user = isRecord(data.user) ? data.user : null;
  if (data.authenticated !== true || !user
    || typeof user.id !== 'string' || !user.id.trim()
    || typeof user.name !== 'string' || !user.name.trim()
    || (user.email !== null && typeof user.email !== 'string')
    || (user.phone !== null && typeof user.phone !== 'string')
    || (user.phoneVerifiedAt !== null && typeof user.phoneVerifiedAt !== 'string')) {
    throw new ApiError('The server returned an invalid session response.', 'invalid-response');
  }
  return {
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
    },
  };
}

function membershipErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You are not allowed to view these business memberships.';
    if (error.status && error.status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
    if (error.kind === 'network') return 'Could not connect to HisabNaki. Check your connection and retry.';
    if (error.kind === 'invalid-response') return 'HisabNaki returned an invalid membership response. Please retry.';
    return error.message;
  }
  if (error instanceof Error && error.message === 'Membership response is incomplete.') {
    return 'HisabNaki returned an invalid membership response. Please retry.';
  }
  return 'Could not load your businesses. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const statusRef = useRef<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const loginAttempt = useRef(0);
  const loginController = useRef<AbortController | null>(null);
  const sessionGeneration = useRef(0);
  const membershipController = useRef<AbortController | null>(null);
  const membershipPromise = useRef<Promise<void> | null>(null);
  const membershipStateRef = useRef<MembershipLoadStatus>('idle');
  const [memberships, setMemberships] = useState<BusinessMembership[]>([]);
  const [membershipsStatus, setMembershipsStatus] = useState<MembershipLoadStatus>('idle');
  const [membershipsError, setMembershipsError] = useState<string | null>(null);
  const [businessAccessError, setBusinessAccessError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<SelectedBusiness | null>(null);
  const [businessContextGeneration, setBusinessContextGeneration] = useState(0);
  const businessGenerationRef = useRef(0);
  const [financialOperationStatus, setFinancialOperationStatus] = useState<FinancialOperationStatus>('idle');
  const financialOperationRef = useRef<FinancialOperationStatus>('idle');

  const updateStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateMembershipStatus = useCallback((next: MembershipLoadStatus) => {
    membershipStateRef.current = next;
    setMembershipsStatus(next);
  }, []);

  const clearBusiness = useCallback(() => {
    apiClient.clearBusinessContext();
    setSelectedBusiness(null);
    businessGenerationRef.current += 1;
    setBusinessContextGeneration(businessGenerationRef.current);
  }, []);

  const handleBusinessForbidden = useCallback(() => {
    clearBusiness();
    setMemberships([]);
    setMembershipsError(null);
    setBusinessAccessError('Access to the selected business was denied. Choose an active business to continue.');
    updateMembershipStatus('idle');
  }, [clearBusiness, updateMembershipStatus]);

  const updateFinancialOperationStatus = useCallback((next: FinancialOperationStatus) => {
    financialOperationRef.current = next;
    setFinancialOperationStatus(next);
  }, []);

  const resetLocalSession = useCallback(() => {
    loginAttempt.current += 1;
    sessionGeneration.current += 1;
    loginController.current?.abort();
    loginController.current = null;
    membershipController.current?.abort();
    membershipController.current = null;
    membershipPromise.current = null;
    clearBusiness();
    apiClient.clearSession();
    setUser(null);
    setMemberships([]);
    updateMembershipStatus('idle');
    setMembershipsError(null);
    setBusinessAccessError(null);
    updateFinancialOperationStatus('idle');
    updateStatus('unauthenticated');
  }, [clearBusiness, updateFinancialOperationStatus, updateMembershipStatus, updateStatus]);

  const logout = useCallback(async () => {
    if (financialOperationRef.current !== 'idle') return false;
    try {
      await apiClient.logout();
    } catch {
      // Clear local state even if the cookie-clearing request fails.
    }
    resetLocalSession();
    return true;
  }, [resetLocalSession]);

  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => { resetLocalSession(); });
    apiClient.setBusinessForbiddenHandler(handleBusinessForbidden);
    return () => {
      apiClient.setUnauthorizedHandler(null);
      apiClient.setBusinessForbiddenHandler(null);
    };
  }, [handleBusinessForbidden, resetLocalSession]);

  const refreshMemberships = useCallback((force = false) => {
    if (statusRef.current !== 'authenticated') {
      return Promise.reject(new ApiError('Please sign in to view businesses.', 'http', 401));
    }
    if (!force && membershipStateRef.current === 'success') return Promise.resolve();
    if (!force && membershipPromise.current) return membershipPromise.current;
    if (force) membershipController.current?.abort();

    const controller = new AbortController();
    membershipController.current = controller;
    const requestSession = sessionGeneration.current;
    setMembershipsError(null);
    updateMembershipStatus('loading');

    const request = (async () => {
      try {
        const result = await apiClient.requestJson('/api/auth/memberships', { signal: controller.signal }, 'auth');
        if (controller.signal.aborted || requestSession !== sessionGeneration.current) return;
        const activeMemberships = parseActiveMemberships(result);
        setMemberships(activeMemberships);
        setBusinessAccessError(null);
        updateMembershipStatus('success');
      } catch (error) {
        if (controller.signal.aborted || requestSession !== sessionGeneration.current) return;
        if (error instanceof ApiError && error.status === 401) return;
        setMembershipsError(membershipErrorMessage(error));
        updateMembershipStatus('error');
      } finally {
        if (membershipController.current === controller) {
          membershipController.current = null;
          membershipPromise.current = null;
        }
      }
    })();
    membershipPromise.current = request;
    return request;
  }, [updateMembershipStatus]);

  const restoreSession = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    updateStatus('loading');
    try {
      const raw = await apiClient.requestJson('/api/auth/session', { method: 'GET' }, 'auth');
      if (generation !== sessionGeneration.current) return;
      const session = parseSessionResponse(raw);
      setUser(session.user);
      setBusinessAccessError(null);
      setMembershipsError(null);
      updateMembershipStatus('idle');
      updateStatus('authenticated');
      void refreshMemberships(true).catch(() => undefined);
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      if (error instanceof ApiError && error.status === 401) {
        resetLocalSession();
        return;
      }
      resetLocalSession();
    }
  }, [refreshMemberships, resetLocalSession, updateMembershipStatus, updateStatus]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const completeAuthenticatedSession = useCallback(async () => {
    apiClient.markSessionChanged();
    clearBusiness();
    setMemberships([]);
    updateMembershipStatus('idle');
    setMembershipsError(null);
    setBusinessAccessError(null);
    updateFinancialOperationStatus('idle');
    await restoreSession();
  }, [clearBusiness, restoreSession, updateFinancialOperationStatus, updateMembershipStatus]);

  const login = useCallback(async (identifier: string, password: string) => {
    loginController.current?.abort();
    const controller = new AbortController();
    loginController.current = controller;
    const attempt = ++loginAttempt.current;

    try {
      await apiClient.login(identifier, password, controller.signal);
      if (attempt !== loginAttempt.current || controller.signal.aborted) {
        throw new ApiError('This sign-in attempt was cancelled. Please try again.', 'aborted');
      }
      await completeAuthenticatedSession();
    } catch (error) {
      if (attempt !== loginAttempt.current || controller.signal.aborted) {
        throw new ApiError('This sign-in attempt was cancelled. Please try again.', 'aborted');
      }
      throw error;
    } finally {
      if (loginController.current === controller) loginController.current = null;
    }
  }, [completeAuthenticatedSession]);

  const selectBusiness = useCallback((businessId: string) => {
    const membership = memberships.find(item => item.businessId === businessId && item.status === 'ACTIVE');
    if (!membership || statusRef.current !== 'authenticated') return false;
    if (selectedBusiness?.businessId === businessId) return true;
    if (financialOperationRef.current !== 'idle') return false;

    apiClient.setBusinessContext(membership.businessId);
    const selected: SelectedBusiness = {
      membershipId: membership.membershipId,
      businessId: membership.businessId,
      businessName: membership.businessName,
      role: membership.role,
    };
    setSelectedBusiness(selected);
    setBusinessAccessError(null);
    businessGenerationRef.current += 1;
    setBusinessContextGeneration(businessGenerationRef.current);
    return true;
  }, [memberships, selectedBusiness]);

  const beginBusinessSwitch = useCallback(() => {
    if (financialOperationRef.current === 'pending') {
      return { ok: false as const, message: 'A saved change is still in progress. Wait for its result before switching businesses.' };
    }
    if (financialOperationRef.current === 'uncertain') {
      return { ok: false as const, message: 'A saved change has an uncertain result. Do not repeat it. Acknowledge the warning on the dashboard before switching businesses.' };
    }
    clearBusiness();
    return { ok: true as const };
  }, [clearBusiness]);

  const value = useMemo(() => ({
    status,
    user,
    login,
    completeAuthenticatedSession,
    logout,
    memberships,
    membershipsStatus,
    membershipsError,
    businessAccessError,
    refreshMemberships,
    selectedBusiness,
    businessContextGeneration,
    selectBusiness,
    beginBusinessSwitch,
    financialOperationStatus,
    setFinancialOperationStatus: updateFinancialOperationStatus,
  }), [
    beginBusinessSwitch,
    businessAccessError,
    businessContextGeneration,
    completeAuthenticatedSession,
    financialOperationStatus,
    login,
    logout,
    memberships,
    membershipsError,
    membershipsStatus,
    refreshMemberships,
    selectBusiness,
    selectedBusiness,
    status,
    updateFinancialOperationStatus,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
