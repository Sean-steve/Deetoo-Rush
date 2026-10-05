import { config } from '@deetoo/config';
import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '@deetoo/types';
import { logger } from '@deetoo/utils';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const requestId = (req as any).requestId || 'req_unknown';
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = statusCode >= 500 && config.isProduction
    ? 'An unexpected error occurred. Please contact support.'
    : err.message || 'Unknown error occurred';

  // Log structured backend error with correlation ID
  logger.error(`API Error: ${message}`, {
    service: 'api',
    requestId,
    route: req.path,
    method: req.method,
    statusCode,
    errorCode: code,
    metadata: {
      details: err.details,
      stack: !config.isProduction ? err.stack : undefined,
    },
  });

  const responseBody: ApiErrorResponse = {
    error: {
      code,
      message,
      details: statusCode >= 500 && config.isProduction ? undefined : err.details,
      request_id: requestId,
    },
  };

  res.status(statusCode).json(responseBody);
}
