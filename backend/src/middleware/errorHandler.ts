import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  const response: Record<string, unknown> = {
    ok: false,
    message,
  };

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({
    ok: false,
    message: 'Route not found',
  });
}
