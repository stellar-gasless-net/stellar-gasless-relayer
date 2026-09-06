import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeReq(apiKey: string): Request {
  return {
    headers: { 'x-api-key': apiKey },
    body: {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

async function freshModule(maxFeeStroops: string, globalBudget: string, perKeyBudget: string) {
  process.env.MAX_FEE_STROOPS = maxFeeStroops;
  process.env.GLOBAL_DAILY_BUDGET_STROOPS = globalBudget;
  process.env.PER_KEY_DAILY_BUDGET_STROOPS = perKeyBudget;
  vi.resetModules();
  return import('../src/middleware/spend_budget');
}

describe('spend budget', () => {
  it('allows relaying when no budget is configured (0 = unlimited)', async () => {
    const { spendBudgetMiddleware } = await freshModule('1000000', '0', '0');
    const next = vi.fn() as NextFunction;

    spendBudgetMiddleware(makeReq('key-a'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects with 402 once a relay would push the per-key daily budget over its cap', async () => {
    const { spendBudgetMiddleware, recordSpend } = await freshModule('1000000', '0', '2000000');
    const next = vi.fn() as NextFunction;

    // Two relays of 1,000,000 stroops each already spent — a third would hit 3,000,000,
    // over the 2,000,000 per-key cap.
    recordSpend('key-a', 1_000_000);
    recordSpend('key-a', 1_000_000);

    const res = makeRes();
    spendBudgetMiddleware(makeReq('key-a'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('does not let one key\'s spend affect a different key\'s independent budget', async () => {
    const { spendBudgetMiddleware, recordSpend } = await freshModule('1000000', '0', '2000000');
    const next = vi.fn() as NextFunction;

    recordSpend('key-a', 2_000_000); // key-a is now fully spent for today

    spendBudgetMiddleware(makeReq('key-b'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects once the global daily budget would be exceeded, even for a key with headroom left', async () => {
    const { spendBudgetMiddleware, recordSpend } = await freshModule('1000000', '1500000', '0');
    const next = vi.fn() as NextFunction;

    // Global budget of 1,500,000 already has 1,000,000 spent by a different key entirely —
    // a new relay of 1,000,000 for key-b would push the global total to 2,000,000.
    recordSpend('key-a', 1_000_000);

    const res = makeRes();
    spendBudgetMiddleware(makeReq('key-b'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('getDailySpend reports real cumulative totals, both global and per key', async () => {
    const { recordSpend, getDailySpend } = await freshModule('1000000', '0', '0');

    recordSpend('key-a', 300_000);
    recordSpend('key-b', 700_000);

    expect(getDailySpend('key-a')).toBe(300_000);
    expect(getDailySpend('key-b')).toBe(700_000);
    expect(getDailySpend()).toBe(1_000_000);
  });

  it('reserves the prospective spend at check time, so a burst of same-tick requests cannot collectively exceed the cap', async () => {
    // Regression test for a real TOCTOU bug: index.ts calls spendBudgetMiddleware BEFORE
    // awaiting simulation/relay, and only used to record spend AFTER those awaits resolved.
    // Concurrent requests could all pass the check before any of them recorded spend,
    // making the cap advisory instead of enforced. Fixed by having the check itself reserve
    // the cost synchronously. This test proves the fix without needing real concurrency:
    // if reservation were deferred (the old bug), all 3 calls below would pass, since
    // nothing here ever calls a separate "recordSpend after success" step.
    const { spendBudgetMiddleware, getDailySpend } = await freshModule('1000000', '0', '2000000');
    const next = vi.fn() as NextFunction;

    spendBudgetMiddleware(makeReq('key-a'), makeRes(), next); // 0 -> 1,000,000 (reserved)
    spendBudgetMiddleware(makeReq('key-a'), makeRes(), next); // 1,000,000 -> 2,000,000 (reserved)
    const res = makeRes();
    spendBudgetMiddleware(makeReq('key-a'), res, next); // would push to 3,000,000 — over the 2,000,000 cap

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(getDailySpend('key-a')).toBe(2_000_000);
  });

  it('releaseReservedBudget rolls back a reservation for a relay that never completed, freeing that headroom back up', async () => {
    const { spendBudgetMiddleware, releaseReservedBudget, getDailySpend } = await freshModule('1000000', '0', '1000000');
    const next = vi.fn() as NextFunction;

    spendBudgetMiddleware(makeReq('key-a'), makeRes(), next); // reserves the full 1,000,000 cap
    expect(getDailySpend('key-a')).toBe(1_000_000);

    releaseReservedBudget('key-a'); // simulates the relay failing after the reservation was made
    expect(getDailySpend('key-a')).toBe(0);

    // Budget headroom is back, so a fresh request should be allowed again.
    const res = makeRes();
    spendBudgetMiddleware(makeReq('key-a'), res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('releaseReservedBudget never lets a total go negative', async () => {
    const { releaseReservedBudget, getDailySpend } = await freshModule('1000000', '0', '0');

    releaseReservedBudget('key-a'); // nothing was ever reserved for this key
    expect(getDailySpend('key-a')).toBe(0);
  });
});
