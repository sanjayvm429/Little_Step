import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/errors.js';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({ body: req.body, query: req.query, params: req.params });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const msg = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return next(new ApiError(400, msg));
      }
      next(err);
    }
  };
}
