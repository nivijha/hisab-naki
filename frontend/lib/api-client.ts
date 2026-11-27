const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 15_000;

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'invalid-response' | 'aborted' | 'session-changed' | 'business-changed';
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
  private businessId: string | null = null;
  private sessionVersion = 0;
  private businessVersion = 0;
  private token: string | null = null;
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

  markSessionChanged() {
    this.cancelAuthenticatedRequests('session-changed');
    this.clearBusinessContext();
    this.sessionVersion += 1;
  }

  setSession(token?: string) {
    this.markSessionChanged();
    if (token) this.token = token;
  }

  clearSession() {
    this.sessionVersion += 1;
    this.cancelAuthenticatedRequests();
    this.clearBusinessContext();
    this.token = null;
  }

  getToken(): string | null {
    return this.token;
  }

  setBusinessContext(businessId: string) {
    this.businessVersion += 1;
    this.businessId = businessId;
    this.cancelBusinessRequests('business-changed');
  }

  clearBusinessContext() {
    this.businessVersion += 1;
    this.businessId = null;
    this.cancelBusinessRequests('business-changed');
  }

  private cancelAuthenticatedRequests(reason: 'session-changed' | 'aborted' = 'aborted') {
    this.activeRequests.forEach(controller => controller.abort(reason === 'session-changed' ? new DOMException('Session changed', 'SessionChangedError') : undefined));
    this.activeRequests.clear();
  }

  private cancelBusinessRequests(reason: 'business-changed' | 'aborted' = 'aborted') {
    this.activeBusinessRequests.forEach(controller => controller.abort(reason === 'business-changed' ? new DOMException('Business changed', 'BusinessChangedError') : undefined));
    this.activeBusinessRequests.clear();
  }

  async login(identifier: string, password: string, signal?: AbortSignal): Promise<unknown> {
    return this.requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal,
    }, 'public', REQUEST_TIMEOUT_MS);
  }

  async logout(signal?: AbortSignal): Promise<unknown> {
    return this.requestJson('/api/auth/logout', {
      method: 'POST',
      signal,
    }, 'auth');
  }

  async requestJson(
    path: string,
    init: RequestInit = {},
    scope: ApiRequestScope = 'business',
    timeoutMs = ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()) ? REQUEST_TIMEOUT_MS : undefined,
  ): Promise<unknown> {
    const requestController = new AbortController();
    const originalSignal = init.signal;
    const requiresAuthentication = scope !== 'public';
    const requiresBusiness = scope === 'business';
    const sessionVersion = this.sessionVersion;
    const businessVersion = this.businessVersion;
    const businessId = requiresBusiness ? this.businessId : null;

    if (requiresBusiness && !businessId) {
      throw new ApiError('Select a business before requesting business data.', 'http', 403);
    }

    const headers = new Headers(init.headers);
    // Callers cannot provide or override tenant/authentication identity headers.
    headers.delete('Authorization');
    headers.delete('X-Business-ID');
    headers.set('Accept', 'application/json');
    if (businessId) headers.set('X-Business-ID', businessId);

    const assertCurrent = () => {
      if (requiresAuthentication && sessionVersion !== this.sessionVersion) {
        throw new ApiError('Your sign-in session changed. Please try again.', 'session-changed');
      }
      if (requiresBusiness && (businessVersion !== this.businessVersion || businessId !== this.businessId)) {
        throw new ApiError('The selected business changed. Please refresh its data.', 'business-changed');
      }
      if (requestController.signal.aborted) {
        const reasonName = requestController.signal.reason?.name;
        if (reasonName === 'SessionChangedError') {
          throw new ApiError('Your sign-in session changed. Please try again.', 'session-changed');
        }
        if (reasonName === 'BusinessChangedError') {
          throw new ApiError('The selected business changed. Please refresh its data.', 'business-changed');
        }
        if (reasonName === 'TimeoutError') {
          throw new ApiError('The request timed out. Please try again.', 'timeout');
        }
        throw new ApiError('Request cancelled.', 'aborted');
      }
    };

    const readResponse = async () => {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers,
          signal: requestController.signal,
          credentials: 'include',
        });
      } catch {
        assertCurrent();
        throw new ApiError('Could not reach HisabNaki. Check your connection and try again.', 'network');
      }

      assertCurrent();
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        // Preserve HTTP error handling even when the server omits a JSON body.
      }
      return { response, payload };
    };

    if (requiresAuthentication) this.activeRequests.add(requestController);
    if (requiresBusiness) this.activeBusinessRequests.add(requestController);
    const abortFromCaller = () => requestController.abort(originalSignal?.reason);
    if (originalSignal?.aborted) abortFromCaller();
    else originalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    let onAbort: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      assertCurrent();
      // Aborting fetch also stops its response body. The race guarantees the
      // caller settles even if an underlying transport never observes abort.
      const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          try { assertCurrent(); } catch (error) { reject(error); }
        };
        requestController.signal.addEventListener('abort', onAbort, { once: true });
      });
      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => requestController.abort(new DOMException('Request timed out.', 'TimeoutError')), timeoutMs);
      }
      const { response, payload } = await Promise.race([readResponse(), cancelled]);
      assertCurrent();

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
      clearTimeout(timeout);
      if (onAbort) requestController.signal.removeEventListener('abort', onAbort);
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
