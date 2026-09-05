import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';

interface UsageQuota {
  count: number;
  resetTime: number;
}

const usageStore = new Map<string, UsageQuota>();
const config = loadConfig();
const WINDOW_MS = config.rateLimitWindowMs;
const MAX_REQUESTS = config.rateLimitMaxRequests;

// Entries are only ever refreshed on a matching request, never removed — without this sweep,
// every distinct IP that has ever hit the relayer stays in memory forever, an unbounded-growth
// DoS vector under many one-off callers. Runs on its own timer rather than per-request so a
// burst of traffic can't itself be used to skip cleanup.
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of usageStore) {
    if (now > record.resetTime) {
      usageStore.delete(key);
    }
  }
}, WINDOW_MS);
sweepInterval.unref();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  // Bucketing by API key gives each dapp integrator its own independent quota instead of
  // lumping every caller behind one corporate NAT IP together. Safe to key by it now that
  // apiKeyMiddleware runs first on every route that uses this and rejects anything not in
  // the configured DAPP_API_KEYS set — a caller can no longer bypass the limit by sending a
  // fresh random key per request, since a fresh random key gets a 401 before reaching here.
  // Falls back to req.ip only for callers that use this middleware without that gate in
  // front of it.
  const headerKey = req.headers['x-api-key'];
  const apiKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || req.body?.dappApiKey || req.ip || 'anonymous';
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
      message: `Maximum ${MAX_REQUESTS} gasless requests per ${WINDOW_MS / 1000}s exceeded.`,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  next();
}
