import { Request, Response, NextFunction } from 'express';

interface UsageQuota {
  count: number;
  resetTime: number;
}

const usageStore = new Map<string, UsageQuota>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // Max 30 gasless txs per minute per IP/API-Key

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = (req.headers['x-api-key'] as string) || req.ip || 'anonymous';
  const now = Date.now();

  const record = usageStore.get(apiKey) || { count: 0, resetTime: now + WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + WINDOW_MS;
  } else {
    record.count += 1;
  }

  usageStore.set(apiKey, record);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${MAX_REQUESTS} gasless requests per minute exceeded.`,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  next();
}
