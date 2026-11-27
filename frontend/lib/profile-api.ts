import { ApiError, apiClient } from './api-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type UserProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  createdAt?: string;
};

type SessionResponse = {
  ok: true;
  data: {
    authenticated: true;
    user: UserProfile;
  };
};

function invalidResponse(message: string) {
  return new ApiError(message, 'invalid-response');
}

export async function fetchUserProfile(signal?: AbortSignal): Promise<UserProfile> {
  const response = await apiClient.requestJson('/api/auth/session', { method: 'GET', signal }, 'auth');
  if (!isRecord(response) || response.ok !== true || !isRecord(response.data)) {
    throw invalidResponse('The server returned an invalid profile response.');
  }
  const data = response.data;
  if (data.authenticated !== true || !isRecord(data.user)) {
    throw invalidResponse('The server returned an invalid profile response.');
  }
  const user = data.user as UserProfile;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
  };
}

export type UpdateProfileInput = {
  name: string;
};

export async function updateProfile(input: UpdateProfileInput, signal?: AbortSignal): Promise<UserProfile> {
  const response = await apiClient.requestJson('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }, 'auth');
  if (!isRecord(response) || response.ok !== true || !isRecord(response.data)) {
    throw invalidResponse('The server returned an invalid update response.');
  }
  const user = response.data.user;
  if (!isRecord(user) || typeof user.id !== 'string' || typeof user.name !== 'string') {
    throw invalidResponse('The server returned an invalid user object.');
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email as string | null,
    phone: user.phone as string | null,
    phoneVerifiedAt: user.phoneVerifiedAt as string | null,
    createdAt: user.createdAt as string | undefined,
  };
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export async function changePassword(input: ChangePasswordInput, signal?: AbortSignal): Promise<void> {
  const response = await apiClient.requestJson('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }, 'auth');
  if (!isRecord(response) || response.ok !== true) {
    throw invalidResponse('The server returned an invalid password change response.');
  }
}