import { Address, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { loadConfig } from '../config';

/**
 * Per-dApp sponsorship rules, modeled on how Pimlico/Biconomy paymasters let an integrator
 * define real policy instead of one flat global budget: a daily spend cap (already existed,
 * just now resolvable per key instead of one number for every key), a cap on how many
 * distinct sponsored transactions one end user can get per day from this dApp (Biconomy's
 * "session"/free-tier idea), and an optional allowlist of contract IDs this dApp's key may
 * have sponsored at all — so a leaked/misused API key can't be used to sponsor arbitrary,
 * unrelated contract calls.
 */
export interface SponsorPolicy {
  /** 0 means unlimited. */
  dailyBudgetStroops: number;
  /** 0 means unlimited. */
  maxSponsoredTxPerUserPerDay: number;
  /** undefined/empty means "no restriction" — any contract may be invoked. */
  allowedContractIds?: string[];
}

function defaultPolicy(): SponsorPolicy {
  const config = loadConfig();
  return {
    dailyBudgetStroops: config.perKeyDailyBudgetStroops,
    maxSponsoredTxPerUserPerDay: 0,
    allowedContractIds: undefined,
  };
}

/**
 * Per-key policy overrides, loaded once from `SPONSOR_POLICIES_JSON` — a JSON object keyed
 * by API key, e.g.:
 *   {"dapp_key_1": {"dailyBudgetStroops": 500000000, "maxSponsoredTxPerUserPerDay": 5},
 *    "dapp_key_2": {"allowedContractIds": ["CABC...", "CDEF..."]}}
 * A key with no entry here falls back entirely to `defaultPolicy()` — this is additive, not
 * a breaking change to existing single-flat-budget deployments.
 */
function loadPolicyOverrides(): Record<string, Partial<SponsorPolicy>> {
  const raw = process.env.SPONSOR_POLICIES_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    console.error('SPONSOR_POLICIES_JSON is set but is not valid JSON — ignoring it, falling back to default policy for every key.');
    return {};
  }
}

const policyOverrides = loadPolicyOverrides();

export function getPolicyForKey(apiKey: string): SponsorPolicy {
  return { ...defaultPolicy(), ...policyOverrides[apiKey] };
}

/** Extracts every contract address a transaction's operations actually invoke. Empty for a
 * transaction with no Soroban invocations at all (e.g. a plain classic payment) — such a
 * transaction is never restricted by `allowedContractIds`, since there's nothing to check
 * it against. */
function extractInvokedContractIds(innerTransactionXdr: string, networkPassphrase: string): string[] {
  const tx = TransactionBuilder.fromXDR(innerTransactionXdr, networkPassphrase) as Transaction;
  const ids: string[] = [];
  for (const op of tx.operations) {
    if (op.type === 'invokeHostFunction') {
      const hostFn = (op as Operation.InvokeHostFunction).func;
      if (hostFn.switch().name === 'hostFunctionTypeInvokeContract') {
        const invokeArgs = hostFn.invokeContract();
        ids.push(Address.fromScAddress(invokeArgs.contractAddress()).toString());
      }
    }
  }
  return ids;
}

/** The inner transaction's own source account — used as the "end user" identity for the
 * per-user sponsorship cap below, since that's genuinely who is asking to transact, not the
 * dApp's own API key (which identifies the integrator, not the end user). */
export function extractUserAddress(innerTransactionXdr: string, networkPassphrase: string): string {
  const tx = TransactionBuilder.fromXDR(innerTransactionXdr, networkPassphrase) as Transaction;
  return tx.source;
}

export function isContractAllowed(policy: SponsorPolicy, innerTransactionXdr: string, networkPassphrase: string): { ok: true } | { ok: false; reason: string } {
  if (!policy.allowedContractIds || policy.allowedContractIds.length === 0) {
    return { ok: true };
  }
  const invoked = extractInvokedContractIds(innerTransactionXdr, networkPassphrase);
  const disallowed = invoked.find((id) => !policy.allowedContractIds!.includes(id));
  if (disallowed) {
    return { ok: false, reason: `this API key is not allowed to sponsor calls to contract ${disallowed}` };
  }
  return { ok: true };
}

interface DailyCount {
  day: string;
  count: number;
}

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollIfNewDay(entry: DailyCount, today: string): DailyCount {
  return entry.day === today ? entry : { day: today, count: 0 };
}

// Keyed by `${apiKey}:${userAddress}` — unlike spend_budget.ts's perKeyTotals (bounded by
// the small, fixed DAPP_API_KEYS allowlist), the set of distinct end users is arbitrary and
// grows with real usage, so this needs the same periodic sweep rate_limit.ts's usageStore
// already uses, or every user who ever transacted stays in memory forever.
const userSponsorCounts = new Map<string, DailyCount>();
const sweepInterval = setInterval(() => {
  const today = currentUtcDay();
  for (const [key, record] of userSponsorCounts) {
    if (record.day !== today) {
      userSponsorCounts.delete(key);
    }
  }
}, 60 * 60 * 1000); // hourly is plenty for a day-keyed counter
sweepInterval.unref();

/** Checks and, if allowed, immediately records one sponsored transaction against this
 * user's daily cap under this dApp's policy — synchronous check-and-record, same reasoning
 * as spend_budget.ts's checkBudget: this must happen before any `await`, or concurrent
 * requests from the same user could all pass the check before any of them recorded usage. */
export function checkAndRecordUserSponsorship(policy: SponsorPolicy, apiKey: string, userAddress: string): { ok: true } | { ok: false; reason: string } {
  if (policy.maxSponsoredTxPerUserPerDay <= 0) {
    return { ok: true };
  }
  const today = currentUtcDay();
  const key = `${apiKey}:${userAddress}`;
  const entry = rollIfNewDay(userSponsorCounts.get(key) ?? { day: today, count: 0 }, today);

  if (entry.count >= policy.maxSponsoredTxPerUserPerDay) {
    return { ok: false, reason: `user ${userAddress} has hit this dApp's daily sponsored-transaction limit (${policy.maxSponsoredTxPerUserPerDay})` };
  }

  entry.count += 1;
  userSponsorCounts.set(key, entry);
  return { ok: true };
}

/** Rolls back a reservation made for a relay that never actually completed — mirrors
 * spend_budget.ts's releaseReservedBudget so a failed/rejected attempt doesn't permanently
 * count against the user's daily cap. */
export function releaseUserSponsorship(apiKey: string, userAddress: string): void {
  const today = currentUtcDay();
  const key = `${apiKey}:${userAddress}`;
  const entry = rollIfNewDay(userSponsorCounts.get(key) ?? { day: today, count: 0 }, today);
  entry.count = Math.max(0, entry.count - 1);
  userSponsorCounts.set(key, entry);
}
