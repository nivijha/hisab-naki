import type { NextFunction, Request, Response } from 'express';

export type RateLimiterOptions = {
  windowMs?: number;
  max?: number;
  now?: () => number;
  message?: string;
};

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

export function createLoginRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? positiveIntEnv('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  const max = options.max ?? positiveIntEnv('LOGIN_RATE_LIMIT_MAX', 10);
  const now = options.now ?? Date.now;
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
    const current = now();
    const key = req.ip ?? 'unknown';

    for (const [entryKey, entry] of attempts) {
      if (entry.resetAt <= current) {
        attempts.delete(entryKey);
      }
    }

    const existing = attempts.get(key);
    if (!existing || existing.resetAt <= current) {
      attempts.set(key, { count: 1, resetAt: current + windowMs });
      next();
      return;
    }

    if (existing.count >= max) {
      res.status(429).json({
        ok: false,
        message: options.message ?? 'Too many requests. Please try again later.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

export const loginRateLimiter = createLoginRateLimiter({
  message: 'Too many login attempts. Please try again later.',
});

export const prototypeSignupRateLimiter = createLoginRateLimiter({
  max: positiveIntEnv('PROTOTYPE_SIGNUP_RATE_LIMIT_MAX', 5),
  windowMs: positiveIntEnv('PROTOTYPE_SIGNUP_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  message: 'Too many signup attempts. Please wait before trying again.',
});

export const aiRateLimiter = createLoginRateLimiter({
  max: positiveIntEnv('AI_RATE_LIMIT_MAX', 30),
  windowMs: positiveIntEnv('AI_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  message: 'Too many interpretation requests. Please try again later.',
});

export const signupRateLimiter = createLoginRateLimiter({
  max: positiveIntEnv('SIGNUP_RATE_LIMIT_MAX', 5),
  windowMs: positiveIntEnv('SIGNUP_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  message: 'Too many signup attempts. Please wait before trying again.',
});

export const signupResendRateLimiter = createLoginRateLimiter({
  max: positiveIntEnv('SIGNUP_RESEND_RATE_LIMIT_MAX', 3),
  windowMs: positiveIntEnv('SIGNUP_RESEND_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  message: 'Too many verification-code requests. Please wait before trying again.',
});

export const signupVerifyRateLimiter = createLoginRateLimiter({
  max: positiveIntEnv('SIGNUP_VERIFY_RATE_LIMIT_MAX', 10),
  windowMs: positiveIntEnv('SIGNUP_VERIFY_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  message: 'Too many verification attempts. Please wait before trying again.',
});
