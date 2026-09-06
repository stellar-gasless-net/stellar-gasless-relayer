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
});
