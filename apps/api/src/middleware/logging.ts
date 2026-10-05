import { Request, Response, NextFunction } from 'express';
import { logger } from '@deetoo/utils';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = (req as any).requestId;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`HTTP ${req.method} ${req.originalUrl || req.url}`, {
      service: 'api',
      requestId,
      method: req.method,
      route: req.baseUrl || req.path,
      statusCode: res.statusCode,
      duration,
      metadata: {
        clientApp: req.header('X-Client-App'),
        userAgent: req.header('User-Agent'),
      },
    });
  });

  next();
}
