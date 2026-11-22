import type { Request, Response } from 'express';
import type { AuthContext } from '../../middleware/authenticate.js';

export const TEST_AUTH: AuthContext = {
  userId: 'user-1',
  businessId: 'biz-1',
  membershipId: 'membership-1',
  role: 'OWNER',
};

export type MockResponse = Response & { statusCode: number; body: unknown };

export function makeReq(options: {
  auth?: AuthContext;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
} = {}): Request {
  return {
    auth: options.auth,
    body: options.body ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    header: (name: string) => options.headers?.[name.toLowerCase()],
  } as Request;
}

export function makeRes(): MockResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as MockResponse;
}
