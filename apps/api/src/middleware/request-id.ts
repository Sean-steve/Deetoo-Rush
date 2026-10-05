import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '@deetoo/utils';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header('X-Request-Id');
  const requestId = incomingId && incomingId.length >= 4 && incomingId.length <= 128 ? incomingId : generateRequestId();
  
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
