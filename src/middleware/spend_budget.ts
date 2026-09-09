import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';
import { getPolicyForKey } from '../relayer/policy';

const config = loadConfig();
const GLOBAL_BUDGET = config.globalDailyBudgetStroops;
const PROSPECTIVE_SPEND_STROOPS = parseInt(config.maxFeeStroops, 10);

interface DailyTotal {
  day: string; // UTC calendar day, 'YYYY-MM-DD'
  stroops: number;
}

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollIfNewDay(entry: DailyTotal, today: string): DailyTotal {
  return entry.day === today ? entry : { day: today, stroops: 0 };
}

let globalTotal: DailyTotal = { day: currentUtcDay(), stroops: 0 };
// Keyed by the operator-configured DAPP_API_KEYS allowlist, which is small and fixed — unlike
// rate_limit.ts's per-IP map (arbitrary internet traffic, needs a sweep), this can't grow
// unbounded, so no cleanup timer is needed here.
const perKeyTotals = new Map<string, DailyTotal>();

/**
 * Would relaying one more transaction push either the global or this API key's daily
 * sponsorship spend over its configured budget? If so, reserves the prospective cost (the
 * fee-bump bid, MAX_FEE_STROOPS — Horizon's immediate submit response doesn't return the
 * actual fee_charged, only a later fetch-by-hash does, so this uses the known worst-case
 * bid rather than a second network round-trip per relay) *synchronously*, in the same tick
 * as the check, with no `await` in between.
 *
 * That matters: `spendBudgetMiddleware` runs before `simulateTransaction`/`relayTransaction`,
 * both of which await real network calls. If the check only *read* totals here and a
 * separate call *recorded* spend only after those awaits resolved, N concurrent requests
 * could all pass the check before any of them recorded spend — the cap would be advisory
 * under concurrency, not enforced (checked and fixed 2026-09-06; see
 * `releaseReservedBudget` for the corresponding rollback on a request that never completes).
 */
export function checkBudget(apiKey: string): { ok: true } | { ok: false; reason: string } {
  const today = currentUtcDay();
  globalTotal = rollIfNewDay(globalTotal, today);
  const keyTotal = rollIfNewDay(perKeyTotals.get(apiKey) ?? { day: today, stroops: 0 }, today);
  // Resolves this key's own configured budget from its sponsorship policy (see
  // relayer/policy.ts) — different dApps can have different caps, rather than every key
  // sharing one flat PER_KEY_DAILY_BUDGET_STROOPS value.
  const perKeyBudget = getPolicyForKey(apiKey).dailyBudgetStroops;

  if (GLOBAL_BUDGET > 0 && globalTotal.stroops + PROSPECTIVE_SPEND_STROOPS > GLOBAL_BUDGET) {
    return { ok: false, reason: 'global daily sponsorship budget exhausted' };
  }
  if (perKeyBudget > 0 && keyTotal.stroops + PROSPECTIVE_SPEND_STROOPS > perKeyBudget) {
    return { ok: false, reason: "this API key's daily sponsorship budget exhausted" };
  }

  globalTotal.stroops += PROSPECTIVE_SPEND_STROOPS;
  keyTotal.stroops += PROSPECTIVE_SPEND_STROOPS;
  perKeyTotals.set(apiKey, keyTotal);
  return { ok: true };
}

/** Rolls back a reservation `checkBudget` made for a relay that never actually completed
 * (simulation rejected it, or the relay itself failed) — otherwise a failed attempt would
 * still count against the day's budget forever. Never lets a total go negative. */
export function releaseReservedBudget(apiKey: string): void {
  const today = currentUtcDay();
  globalTotal = rollIfNewDay(globalTotal, today);
  globalTotal.stroops = Math.max(0, globalTotal.stroops - PROSPECTIVE_SPEND_STROOPS);

  const keyTotal = rollIfNewDay(perKeyTotals.get(apiKey) ?? { day: today, stroops: 0 }, today);
  keyTotal.stroops = Math.max(0, keyTotal.stroops - PROSPECTIVE_SPEND_STROOPS);
  perKeyTotals.set(apiKey, keyTotal);
}

/** Directly adds to today's recorded spend. Used by `checkBudget`'s reservation, and by
 * tests to seed prior spend — not called after a successful relay any more, since
 * `checkBudget` already reserved the cost up front. */
export function recordSpend(apiKey: string, stroops: number): void {
  const today = currentUtcDay();
  globalTotal = rollIfNewDay(globalTotal, today);
  globalTotal.stroops += stroops;

  const keyTotal = rollIfNewDay(perKeyTotals.get(apiKey) ?? { day: today, stroops: 0 }, today);
  keyTotal.stroops += stroops;
  perKeyTotals.set(apiKey, keyTotal);
}

/** Read-only: today's cumulative spend so far, global or for one key. Exists mainly for
 * tests to assert real state rather than inferring it indirectly. */
export function getDailySpend(apiKey?: string): number {
  const today = currentUtcDay();
  if (apiKey === undefined) {
    return rollIfNewDay(globalTotal, today).stroops;
  }
  return rollIfNewDay(perKeyTotals.get(apiKey) ?? { day: today, stroops: 0 }, today).stroops;
}

export function spendBudgetMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerKey = req.headers['x-api-key'];
  const apiKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || req.body?.dappApiKey || 'unknown';

  const result = checkBudget(apiKey);
  if (!result.ok) {
    return res.status(402).json({
      success: false,
      error: `Sponsorship budget exhausted: ${result.reason}. Resets at 00:00 UTC.`,
    });
  }

  next();
}
