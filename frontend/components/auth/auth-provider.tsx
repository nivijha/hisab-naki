'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiClient } from '@/lib/api-client';
import { parseActiveMemberships, type BusinessMembership } from '@/lib/membership-contract';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';
export type { BusinessMembership, MembershipRole, MembershipStatus } from '@/lib/membership-contract';
export type SelectedBusiness = Pick<BusinessMembership, 'businessId' | 'businessName' | 'role' | 'membershipId'>;
export type MembershipLoadStatus = 'idle' | 'loading' | 'success' | 'error';
export type FinancialOperationStatus = 'idle' | 'pending' | 'uncertain';

type LoginResponse = {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  expiresIn: number;
};

type AuthContextValue = {
  status: AuthStatus;
  login: (identifier: string, password: string, controller: AbortController) => Promise<void>;
  logout: () => boolean;
  getToken: () => string | null;
  memberships: BusinessMembership[];
  membershipsStatus: MembershipLoadStatus;
  membershipsError: string | null;
  businessAccessError: string | null;
  refreshMemberships: (force?: boolean) => Promise<boolean>;
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

function parseLoginResponse(value: unknown): LoginResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new ApiError('The server returned an invalid sign-in response.', 'invalid-response');
  }

  const { token, tokenType, expiresAt, expiresIn } = value.data;
  const expiry = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  if (typeof token !== 'string' || !token.trim() || tokenType !== 'Bearer'
    || !Number.isFinite(expiry) || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ApiError('The server returned an invalid sign-in response.', 'invalid-response');
  }

  const effectiveExpiry = Math.min(expiry, Date.now() + expiresIn * 1000);
  if (effectiveExpiry <= Date.now()) {
    throw new ApiError('The sign-in session has already expired. Please try again.', 'invalid-response');
  }

  return { token, tokenType, expiresAt: new Date(effectiveExpiry).toISOString(), expiresIn };
}

function membershipErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You are not allowed to view these business memberships.';
    if (error.status === 429) return 'Too many requests. Please wait before retrying.';
    if (error.status && error.status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
    if (error.kind === 'timeout') return 'Loading your businesses timed out. Please try again.';
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
  const loginAttempt = useRef(0);
  const loginController = useRef<AbortController | null>(null);
  const tokenExpiry = useRef<number | null>(null);
  const sessionGeneration = useRef(0);
  const membershipController = useRef<AbortController | null>(null);
  const membershipPromise = useRef<Promise<boolean> | null>(null);
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

  const logout = useCallback((force = false) => {
    if (!force && financialOperationRef.current !== 'idle') return false;
    loginAttempt.current += 1;
    sessionGeneration.current += 1;
    loginController.current?.abort();
    loginController.current = null;
    membershipController.current?.abort();
    membershipController.current = null;
    membershipPromise.current = null;
    tokenExpiry.current = null;
    clearBusiness();
    apiClient.clearSession();
    setMemberships([]);
    updateMembershipStatus('idle');
    setMembershipsError(null);
    setBusinessAccessError(null);
    updateFinancialOperationStatus('idle');
    updateStatus('unauthenticated');
    return true;
  }, [clearBusiness, updateFinancialOperationStatus, updateMembershipStatus, updateStatus]);

  useEffect(() => {
    updateStatus('unauthenticated');
    apiClient.setUnauthorizedHandler(() => { logout(true); });
    apiClient.setBusinessForbiddenHandler(handleBusinessForbidden);
    return () => {
      apiClient.setUnauthorizedHandler(null);
      apiClient.setBusinessForbiddenHandler(null);
      loginController.current?.abort();
      membershipController.current?.abort();
      apiClient.clearSession();
    };
  }, [handleBusinessForbidden, logout, updateStatus]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const token = apiClient.getToken();
    if (!token) {
      logout();
      return;
    }
    const expiry = tokenExpiry.current;
    if (!expiry) return;
    const timeout = window.setTimeout(() => { logout(true); }, Math.max(0, expiry - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [logout, status]);

  const login = useCallback(async (identifier: string, password: string, controller: AbortController) => {
    loginController.current?.abort();
    loginController.current = controller;
    const attempt = ++loginAttempt.current;

    try {
      const raw = await apiClient.login(identifier, password, controller.signal);
      if (attempt !== loginAttempt.current || controller.signal.aborted) {
        throw new ApiError('This sign-in attempt was cancelled. Please try again.', 'aborted');
      }
      const response = parseLoginResponse(raw);
      const expiration = Date.parse(response.expiresAt);
      if (expiration <= Date.now()) throw new ApiError('The sign-in session has expired. Please try again.', 'invalid-response');

      sessionGeneration.current += 1;
      clearBusiness();
      setMemberships([]);
      updateMembershipStatus('idle');
      setMembershipsError(null);
      setBusinessAccessError(null);
      updateFinancialOperationStatus('idle');
      tokenExpiry.current = expiration;
      apiClient.setSession(response.token);
      updateStatus('authenticated');
    } catch (error) {
      if (attempt !== loginAttempt.current || controller.signal.aborted) {
        throw new ApiError('This sign-in attempt was cancelled. Please try again.', 'aborted');
      }
      throw error;
    } finally {
      if (loginController.current === controller) loginController.current = null;
    }
  }, [clearBusiness, updateFinancialOperationStatus, updateMembershipStatus, updateStatus]);

  const refreshMemberships = useCallback((force = false) => {
    if (statusRef.current !== 'authenticated' || !apiClient.getToken()) {
      return Promise.reject(new ApiError('Please sign in to view businesses.', 'http', 401));
    }
    if (!force && membershipStateRef.current === 'success') return Promise.resolve(true);
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
        if (controller.signal.aborted || requestSession !== sessionGeneration.current) return false;
        const activeMemberships = parseActiveMemberships(result);
        setMemberships(activeMemberships);
        setBusinessAccessError(null);
        updateMembershipStatus('success');
        return true;
      } catch (error) {
        if (controller.signal.aborted || requestSession !== sessionGeneration.current) return false;
        setMembershipsError(membershipErrorMessage(error));
        updateMembershipStatus('error');
        return false;
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

  const getToken = useCallback(() => apiClient.getToken(), []);
  const value = useMemo(() => ({
    status,
    login,
    logout,
    getToken,
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
    businessContextGeneration,
    financialOperationStatus,
    getToken,
    login,
    logout,
    memberships,
    membershipsError,
    businessAccessError,
    membershipsStatus,
    refreshMemberships,
    selectBusiness,
    selectedBusiness,
    status,
    updateFinancialOperationStatus,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
