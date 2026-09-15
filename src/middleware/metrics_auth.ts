import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';

/**
 * Secures /metrics and /metrics.json endpoints against unauthorized inspection.
 * Accepts either:
 * 1. An operator Bearer token matching METRICS_TOKEN (for Prometheus scraper jobs).
 * 2. An authorized dapp API key from DAPP_API_KEYS (via X-API-Key header or query parameter).
 */
export function metricsAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const config = loadConfig();
  const validKeys = new Set(config.dappApiKeys);
  const metricsToken = config.metricsToken;

  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (metricsToken && bearer === metricsToken) {
      return next();
    }
  }

  // 2. Check X-API-Key header or query parameter
  const headerKey = req.headers['x-api-key'];
  const key = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || (req.query?.apiKey as string) || req.body?.dappApiKey;

  if (key && validKeys.has(key)) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Metrics endpoint requires a valid Bearer token or authorized API key.',
  });
}
