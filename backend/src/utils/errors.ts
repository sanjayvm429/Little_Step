import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  // Mongoose validation error
  if (err && typeof err === 'object' && 'name' in err && err.name === 'ValidationError') {
    const messages = Object.values((err as unknown as { errors: Record<string, { message: string }> }).errors).map(
      (e) => e.message
    );
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }
  // JWT errors
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: string }).name;
    if (name === 'JsonWebTokenError' || name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}
