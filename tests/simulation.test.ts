import { describe, it, expect, vi, afterEach } from 'vitest';
import { SorobanSimulator } from '../src/relayer/simulation';

describe('SorobanSimulator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success with real cost fields when Soroban RPC succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: {
          minResourceFee: '123456',
          cost: { cpuInsns: '1000000', memBytes: '50000' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sim = new SorobanSimulator('https://example-soroban-rpc.test');
    const result = await sim.simulateTransaction('AAAA...fake-xdr');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example-soroban-rpc.test',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.isSuccess).toBe(true);
    expect(result.minResourceFeeStroops).toBe('123456');
    expect(result.cpuInstructions).toBe(1000000);
    expect(result.memoryBytes).toBe(50000);
  });

  it('surfaces a real Soroban RPC error instead of pretending to succeed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'invalid transaction XDR' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sim = new SorobanSimulator('https://example-soroban-rpc.test');
    const result = await sim.simulateTransaction('not-valid-xdr');

    expect(result.isSuccess).toBe(false);
    expect(result.error).toContain('invalid transaction XDR');
  });

  it('reports failure (not a fabricated success) when the network call itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const sim = new SorobanSimulator('https://unreachable.test');
    const result = await sim.simulateTransaction('AAAA...fake-xdr');

    expect(result.isSuccess).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
