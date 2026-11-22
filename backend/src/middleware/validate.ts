import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodIssue } from 'zod';

type ValidateSource = 'body' | 'params' | 'query';

export function validate(schema: ZodSchema, source: ValidateSource = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const issues = result.error.issues.map((issue: ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        ok: false,
        message: 'Validation failed',
        errors: issues,
      });
    }

    req[source] = result.data as never;
    next();
  };
}
