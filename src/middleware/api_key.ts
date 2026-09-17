import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';

const config = loadConfig();
const validKeys = config.dappApiKeys;

function safeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function isValidApiKey(providedKey: string, allowedKeys: string[]): boolean {
  let matched = false;
  for (const allowed of allowedKeys) {
    if (safeCompare(providedKey, allowed)) {
      matched = true;
    }
  }
  return matched;
}

// Reads the same X-API-Key header @stellar-gasless/sdk's GaslessClient sends, falling back
// to the dappApiKey body field for callers that only set that. Rejects before the request
// ever reaches rate limiting or simulation — an unauthenticated caller shouldn't be able to
// spend any of the relayer's work budget, not even to get a 429.
export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerKey = req.headers['x-api-key'];
  const key = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || req.body?.dappApiKey;

  if (!key || typeof key !== 'string' || !isValidApiKey(key, validKeys)) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid API key. Provide a valid key via the X-API-Key header.',
    });
  }

  next();
}
