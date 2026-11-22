const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export type ApiErrorKind = 'http' | 'network' | 'invalid-response' | 'aborted' | 'session-changed' | 'business-changed';
export type ApiRequestScope = 'public' | 'auth' | 'business';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.message === 'string' && value.message.trim() ? value.message : undefined;
}

class ApiClient {
  private token: string | null = null;
  private businessId: string | null = null;
  private sessionVersion = 0;
  private businessVersion = 0;
  private activeRequests = new Set<AbortController>();
  private activeBusinessRequests = new Set<AbortController>();
  private onUnauthorized: (() => void) | null = null;
  private onBusinessForbidden: (() => void) | null = null;

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  setBusinessForbiddenHandler(handler: (() => void) | null) {
    this.onBusinessForbidden = handler;
  }

  setSession(token: string) {
    this.cancelAuthenticatedRequests();
    this.clearBusinessContext();
    this.sessionVersion += 1;
    this.token = token;
  }

  clearSession() {
    this.token = null;
    this.sessionVersion += 1;
    this.clearBusinessContext();
    this.cancelAuthenticatedRequests();
  }

  setBusinessContext(businessId: string) {
    this.cancelBusinessRequests();
    this.businessVersion += 1;
    this.businessId = businessId;
  }

  clearBusinessContext() {
    this.cancelBusinessRequests();
    this.businessVersion += 1;
    this.businessId = null;
  }

  getToken() {
    return this.token;
  }

  private cancelAuthenticatedRequests() {
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
  }

  private cancelBusinessRequests() {
    this.activeBusinessRequests.forEach(controller => controller.abort());
    this.activeBusinessRequests.clear();
  }

  async login(identifier: string, password: string, signal?: AbortSignal): Promise<unknown> {
    return this.requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal,
    }, 'public');
  }

  async requestJson(path: string, init: RequestInit = {}, scope: ApiRequestScope = 'business'): Promise<unknown> {
    const requestController = new AbortController();
    const originalSignal = init.signal;
    const requiresAuthentication = scope !== 'public';
    const requiresBusiness = scope === 'business';
    const sessionVersion = this.sessionVersion;
    const businessVersion = this.businessVersion;
    const businessId = requiresBusiness ? this.businessId : null;
    const token = requiresAuthentication ? this.token : null;

    if (requiresAuthentication && !token) {
      throw new ApiError('Please sign in to continue.', 'http', 401);
    }
    if (requiresBusiness && !businessId) {
      throw new ApiError('Select a business before requesting business data.', 'http', 403);
    }

    if (requiresAuthentication) this.activeRequests.add(requestController);
    if (requiresBusiness) this.activeBusinessRequests.add(requestController);
    const abortFromCaller = () => requestController.abort();
    if (originalSignal?.aborted) requestController.abort();
    else originalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const headers = new Headers(init.headers);
    // Callers cannot provide or override tenant/authentication identity headers.
    headers.delete('Authorization');
    headers.delete('X-Business-ID');
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (businessId) headers.set('X-Business-ID', businessId);

    try {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers,
          signal: requestController.signal,
          credentials: 'omit',
        });
      } catch (error) {
        if (requestController.signal.aborted) {
          throw new ApiError('Request cancelled.', 'aborted');
        }
        throw new ApiError('Could not reach HisabNaki. Check your connection and try again.', 'network');
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (requiresAuthentication && sessionVersion !== this.sessionVersion) {
          throw new ApiError('Your sign-in session changed. Please try again.', 'session-changed');
        }
        if (requiresBusiness && (businessVersion !== this.businessVersion || businessId !== this.businessId)) {
          throw new ApiError('The selected business changed. Please refresh its data.', 'business-changed');
        }
        if (requiresAuthentication && response.status === 401) this.onUnauthorized?.();
        if (!response.ok) {
          if (requiresBusiness && response.status === 403) this.onBusinessForbidden?.();
          throw new ApiError(this.messageForStatus(response.status), 'http', response.status);
        }
        throw new ApiError('The server returned an invalid response.', 'invalid-response', response.status);
      }

      if (requiresAuthentication && sessionVersion !== this.sessionVersion) {
        throw new ApiError('Your sign-in session changed. Please try again.', 'session-changed');
      }
      if (requiresBusiness && (businessVersion !== this.businessVersion || businessId !== this.businessId)) {
        throw new ApiError('The selected business changed. Please refresh its data.', 'business-changed');
      }

      if (!response.ok) {
        const status = response.status;
        if (requiresAuthentication && status === 401) this.onUnauthorized?.();
        if (requiresBusiness && status === 403) this.onBusinessForbidden?.();
        const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : undefined;
        const message = getMessage(payload);
        throw new ApiError(message ?? this.messageForStatus(status), 'http', status, code);
      }

      if (!isRecord(payload) || payload.ok !== true) {
        throw new ApiError('The server returned an invalid response.', 'invalid-response', response.status);
      }

      return payload;
    } finally {
      originalSignal?.removeEventListener('abort', abortFromCaller);
      this.activeRequests.delete(requestController);
      this.activeBusinessRequests.delete(requestController);
    }
  }

  private messageForStatus(status: number) {
    if (status === 401) return 'Your sign-in has expired. Please sign in again.';
    if (status === 403) return 'You do not have access to this business.';
    if (status === 404) return 'The requested information could not be found.';
    if (status === 409) return 'This action conflicts with the current information. Review it and try again.';
    if (status === 429) return 'Too many attempts. Please wait a little before trying again.';
    if (status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
    return 'The request could not be completed.';
  }
}

export const apiClient = new ApiClient();
