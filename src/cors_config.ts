import type { CorsOptions } from 'cors';

/**
 * Builds real CORS options from an operator-configured origin allowlist. Kept as its own
 * pure function (not just inlined into `cors({...})` in index.ts) so the actual allow/deny
 * decision is directly unit-testable without spinning up an HTTP server.
 *
 * An empty allowlist means "allow any origin" — the same permissive default Express's cors()
 * has with no options, kept for easy local dev and server-to-server-only deployments where
 * CORS is irrelevant. Configuring CORS_ORIGINS is what actually restricts this; unlike
 * RELAYER_SECRETS/DAPP_API_KEYS, this doesn't hard-fail on empty, since a wide-open default
 * is a real (if weaker) choice some deployments genuinely want, not a broken state.
 */
export function buildCorsOptions(allowedOrigins: string[]): CorsOptions {
  if (allowedOrigins.length === 0) {
    return { origin: true };
  }

  return {
    origin(requestOrigin, callback) {
      // No Origin header at all (server-to-server calls, curl, same-origin) is not a
      // cross-origin browser request in the first place — nothing here to restrict.
      if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${requestOrigin} is not in CORS_ORIGINS`));
    },
  };
}
