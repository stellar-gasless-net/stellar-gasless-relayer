import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';
import {
  checkAndRecordUserSponsorship,
  extractUserAddress,
  getPolicyForKey,
  isContractAllowed,
} from '../relayer/policy';

const config = loadConfig();

/**
 * Enforces the two sponsorship-policy checks that go beyond a flat spend cap: an optional
 * per-dApp contract allowlist, and a per-end-user daily sponsored-transaction cap. Runs
 * after `apiKeyMiddleware` (needs a validated key) and before `spendBudgetMiddleware` (no
 * reason to reserve budget for a request this rejects anyway).
 *
 * Both checks need `innerTransactionXdr`, which normally isn't parsed until deep inside
 * `relayTransaction` — parsing it here too is a deliberate small duplication rather than
 * restructuring the whole request flow around a policy engine that only two of the
 * possible checks actually need.
 */
export function policyMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerKey = req.headers['x-api-key'];
  const apiKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || req.body?.dappApiKey || 'unknown';
  const { innerTransactionXdr } = req.body;

  if (!innerTransactionXdr) {
    // Missing-payload case is already handled with its own clear error later in the route
    // handler — nothing for a policy check to meaningfully do without a transaction to
    // inspect, so let the request through to that existing check.
    return next();
  }

  const policy = getPolicyForKey(apiKey);

  let contractCheck: { ok: true } | { ok: false; reason: string };
  let userAddress: string;
  try {
    contractCheck = isContractAllowed(policy, innerTransactionXdr, config.networkPassphrase);
    userAddress = extractUserAddress(innerTransactionXdr, config.networkPassphrase);
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: `Could not parse innerTransactionXdr to evaluate sponsorship policy: ${err.message || err}`,
    });
  }

  if (!contractCheck.ok) {
    return res.status(403).json({ success: false, error: contractCheck.reason });
  }

  const userCheck = checkAndRecordUserSponsorship(policy, apiKey, userAddress);
  if (!userCheck.ok) {
    return res.status(429).json({ success: false, error: userCheck.reason });
  }

  // Stash for the route handler to release on a failed/rejected relay, mirroring how
  // spendBudgetMiddleware's reservation gets released via releaseReservedBudget.
  (res.locals as any).policyUserAddress = userAddress;
  (res.locals as any).policyApiKey = apiKey;

  next();
}
