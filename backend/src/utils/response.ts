import type { Response } from 'express';

export function success<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
) {
  return res.status(statusCode).json({
    ok: true,
    data,
    ...(message ? { message } : undefined),
  });
}

export function failure(
  res: Response,
  message: string,
  statusCode = 500
) {
  return res.status(statusCode).json({
    ok: false,
    message,
  });
}
