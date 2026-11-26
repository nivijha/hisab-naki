import { ApiError, apiClient } from './api-client';
import { isSignupVerified, parseCreatedFirstBusiness, parsePrototypeSignupResponse, parseResendResponse, parseSignupStart } from './signup-contract';

function invalidResponse(message: string) {
  return new ApiError(message, 'invalid-response');
}

export async function registerPrototypeSignup(
  input: { name: string; email: string; phone?: string; password: string },
  signal?: AbortSignal
) {
  const response = await apiClient.requestJson('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }, 'public');
  const parsed = parsePrototypeSignupResponse(response);
  if (!parsed) throw invalidResponse('The server returned an invalid registration response.');
  return parsed;
}

export async function registerSignup(input: { name: string; phone: string; password: string }, signal?: AbortSignal) {
  const response = await apiClient.requestJson('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }, 'public');
  const parsed = parseSignupStart(response);
  if (!parsed) throw invalidResponse('The server returned an invalid registration response.');
  return parsed;
}

export async function resendSignupCode(phone: string, signal?: AbortSignal) {
  const response = await apiClient.requestJson('/api/auth/register/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
    signal,
  }, 'public');
  const message = parseResendResponse(response);
  if (!message) throw invalidResponse('The server returned an invalid verification response.');
  return message;
}

export async function verifySignupCode(phone: string, code: string, signal?: AbortSignal) {
  const response = await apiClient.requestJson('/api/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
    signal,
  }, 'public');
  if (!isSignupVerified(response)) throw invalidResponse('The server did not confirm phone verification.');
}

export async function createFirstBusiness(name: string, idempotencyKey: string, signal?: AbortSignal) {
  const response = await apiClient.requestJson('/api/businesses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ name }),
    signal,
  }, 'auth');
  const parsed = parseCreatedFirstBusiness(response);
  if (!parsed) throw invalidResponse('The server returned an invalid shop setup response.');
  return parsed;
}

export function createIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return `onboard-${crypto.randomUUID()}`;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `onboard-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export const PENDING_SIGNUP_PHONE_KEY = 'hisabnaki:signup:phone';
export const VERIFIED_SIGNUP_KEY = 'hisabnaki:signup:verified';
export const FIRST_BUSINESS_OPERATION_PREFIX = 'hisabnaki:first-business:';

export function currentSessionSubject(token: string | null): string | null {
  if (!token || typeof atob !== 'function') return null;
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '='));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (claims && typeof claims === 'object' && 'sub' in claims && typeof claims.sub === 'string' && claims.sub.trim()) return claims.sub;
  } catch { /* A token subject is used only to scope local retry metadata, never for authorization. */ }
  return null;
}
