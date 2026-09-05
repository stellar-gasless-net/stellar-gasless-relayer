import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeReq(opts: { headerKey?: string; bodyKey?: string } = {}): Request {
  return {
    headers: opts.headerKey ? { 'x-api-key': opts.headerKey } : {},
    body: opts.bodyKey ? { dappApiKey: opts.bodyKey } : {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

async function freshMiddleware(validKeysCsv: string) {
  process.env.DAPP_API_KEYS = validKeysCsv;
  vi.resetModules();
  const mod = await import('../src/middleware/api_key');
  return mod.apiKeyMiddleware;
}

describe('apiKeyMiddleware', () => {
  it('rejects with 401 when no key is provided at all', async () => {
    const middleware = await freshMiddleware('valid-key-1,valid-key-2');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the key is not in the configured set', async () => {
    const middleware = await freshMiddleware('valid-key-1,valid-key-2');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq({ headerKey: 'a-brand-new-random-key' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts a valid key sent via the X-API-Key header', async () => {
    const middleware = await freshMiddleware('valid-key-1,valid-key-2');
    const next = vi.fn() as NextFunction;

    middleware(makeReq({ headerKey: 'valid-key-2' }), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid key sent via the dappApiKey body field when no header is set', async () => {
    const middleware = await freshMiddleware('valid-key-1,valid-key-2');
    const next = vi.fn() as NextFunction;

    middleware(makeReq({ bodyKey: 'valid-key-1' }), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('prefers the header over the body when both are present and only the header is valid', async () => {
    const middleware = await freshMiddleware('valid-key-1');
    const next = vi.fn() as NextFunction;

    middleware(makeReq({ headerKey: 'valid-key-1', bodyKey: 'garbage' }), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
