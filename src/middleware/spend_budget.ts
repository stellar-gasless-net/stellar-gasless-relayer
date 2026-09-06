import { Request, Response, NextFunction } from 'express';
import { loadConfig } from '../config';

const config = loadConfig();
const GLOBAL_BUDGET = config.globalDailyBudgetStroops;
const PER_KEY_BUDGET = config.perKeyDailyBudgetStroops;
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
 * sponsorship spend over its configured budget? Checked *before* simulation/relay, using the
 * fee-bump bid (MAX_FEE_STROOPS) as the prospective cost — Horizon's immediate submit
 * response doesn't return the actual fee_charged (only a later fetch-by-hash does), so this
 * uses the known worst-case bid rather than adding a second network round-trip per relay.
 * That's a deliberately conservative choice for a budget guard: treating the bid as the cost
 * can only ever reserve *more* headroom than a transaction actually uses, never less.
 */
export function checkBudget(apiKey: string): { ok: true } | { ok: false; reason: string } {
  const today = currentUtcDay();
  globalTotal = rollIfNewDay(globalTotal, today);
  const keyTotal = rollIfNewDay(perKeyTotals.get(apiKey) ?? { day: today, stroops: 0 }, today);

  if (GLOBAL_BUDGET > 0 && globalTotal.stroops + PROSPECTIVE_SPEND_STROOPS > GLOBAL_BUDGET) {
    return { ok: false, reason: 'global daily sponsorship budget exhausted' };
  }
  if (PER_KEY_BUDGET > 0 && keyTotal.stroops + PROSPECTIVE_SPEND_STROOPS > PER_KEY_BUDGET) {
    return { ok: false, reason: "this API key's daily sponsorship budget exhausted" };
  }
  return { ok: true };
}

/** Records real spend after a relay actually succeeds — never called for a rejected or
 * failed attempt, so budgets track real sponsorship, not attempts. */
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
