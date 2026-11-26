import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

export interface SessionUserLookup {
  findById(userId: string): Promise<SessionUser | null>;
}

export class PrismaSessionUserLookup implements SessionUserLookup {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findById(userId: string): Promise<SessionUser | null> {
    return this.client.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, phoneVerifiedAt: true },
    });
  }
}

export function createSessionService(lookup: SessionUserLookup = new PrismaSessionUserLookup()) {
  return {
    async getSession(userId: string) {
      if (!userId || !userId.trim()) {
        throw new HttpError(401, 'Authenticated user is required.');
      }
      const user = await lookup.findById(userId);
      if (!user) {
        throw new HttpError(401, 'Authenticated user was not found.');
      }
      return {
        authenticated: true as const,
        user,
      };
    },
  };
}

export const sessionService = createSessionService();
