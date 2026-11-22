import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

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
  logger.error('server.error', { statusCode, errorName: err.name || 'Error' });
  const isProduction = process.env.NODE_ENV === 'production';
  const hasExplicitStatus =
    typeof err.statusCode === 'number' || typeof err.status === 'number';
  const message =
    !isProduction || hasExplicitStatus
      ? err.message || 'Internal server error'
      : 'Internal server error';

  const response: Record<string, unknown> = {
    ok: false,
    message,
  };

  if (!isProduction && err.stack) {
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
