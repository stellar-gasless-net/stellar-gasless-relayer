import { Account, Contract, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { loadConfig } from '../config';

// stellar-sdk's own well-known placeholder source account for read-only simulation — never
// submitted anywhere, only used to build a syntactically valid transaction to simulate.
const SIMULATION_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

// Real credential status changes rarely (an ASP attests once; it doesn't flip back and
// forth), so caching it for a few minutes keeps a burst of relay requests from the same
// address from hammering a DIFFERENT project's Soroban RPC with a simulate call apiece.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  verified: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test-only: clears the in-memory verification cache between test cases. */
export function clearZkidentCache(): void {
  cache.clear();
}

/**
 * Real, read-only cross-contract check against stellar-zklab/stellar-zkident's deployed
 * credential_verifier — a genuinely different org's repo, not an internal helper — for
 * whether `userAddress` holds a verified credential of the configured type. This is the
 * first real dependency between stellar-gasless-net and stellar-zklab: the relayer's own
 * sponsorship tiering (see relayer/policy.ts) actually depends on zkident's real gate,
 * the same has_credential() check reputation_nft::mint() and sybil_resistant_faucet::claim()
 * already use on that side.
 *
 * Builds and simulates (never submits) a has_credential(user, credential_type) invocation by
 * talking to Soroban RPC directly with a raw fetch, the same way relayer/simulation.ts
 * already does, rather than pulling in stellar-sdk's heavier contract.Client (which would
 * fetch and parse zkident's whole contract spec over the network just for one fixed, known
 * method signature).
 *
 * Fails closed: any RPC error, malformed response, or missing config is treated as "not
 * verified" rather than thrown — an outage in a DIFFERENT project's infrastructure must
 * never grant elevated sponsorship trust, and must never take this relayer's own request
 * pipeline down with it.
 */
export async function hasVerifiedCredential(userAddress: string): Promise<boolean> {
  const config = loadConfig();
  if (!config.zkidentCredentialVerifierId) {
    // Feature not configured — every user is treated identically, same as before this
    // integration existed.
    return false;
  }

  const cached = cache.get(userAddress);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.verified;
  }

  try {
    const account = new Account(SIMULATION_ACCOUNT, '0');
    const op = new Contract(config.zkidentCredentialVerifierId).call(
      'has_credential',
      nativeToScVal(userAddress, { type: 'address' }),
      nativeToScVal(config.zkidentRequiredCredentialType, { type: 'string' })
    );
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: config.networkPassphrase })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const response = await fetch(config.sorobanRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'simulateTransaction',
        params: { transaction: tx.toXDR() },
      }),
    });
    const body = await response.json();

    if (body.error) {
      throw new Error(body.error.message || 'Soroban RPC returned an error');
    }
    if (body.result?.error) {
      throw new Error(String(body.result.error));
    }
    const resultXdr = body.result?.results?.[0]?.xdr;
    if (!resultXdr) {
      throw new Error('Soroban RPC returned no result for has_credential simulation');
    }

    const verified = Boolean(scValToNative(xdr.ScVal.fromXDR(resultXdr, 'base64')));
    cache.set(userAddress, { verified, expiresAt: Date.now() + CACHE_TTL_MS });
    return verified;
  } catch (err: any) {
    console.error(`[zkident] has_credential check failed for ${userAddress}, treating as unverified: ${err.message ?? err}`);
    return false;
  }
}
