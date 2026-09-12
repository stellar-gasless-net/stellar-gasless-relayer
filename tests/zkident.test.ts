import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { nativeToScVal, xdr } from '@stellar/stellar-sdk';

const VERIFIER_ID = 'CDLRSLHALMX6OU5IHWY6CKTROK3SYENEA75K6OWSZCPAW4EOTR2OZGSF';

function rpcResultFor(value: boolean) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      results: [{ xdr: nativeToScVal(value).toXDR('base64') }],
    },
  };
}

async function freshModule(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import('../src/relayer/zkident');
}

describe('hasVerifiedCredential (stellar-zkident cross-org integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false without making any network call when the feature is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { hasVerifiedCredential } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: undefined });

    const result = await hasVerifiedCredential('GAUZ4T6UT7XMGOL6WYPWWSYPZQ7ZLILCAS2ROYCH5ILHHOWQYUGVRTAB');

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns true when the real credential_verifier reports has_credential = true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => rpcResultFor(true) });
    vi.stubGlobal('fetch', fetchMock);
    const { hasVerifiedCredential } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: VERIFIER_ID });

    const result = await hasVerifiedCredential('GAUZ4T6UT7XMGOL6WYPWWSYPZQ7ZLILCAS2ROYCH5ILHHOWQYUGVRTAB');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when the real credential_verifier reports has_credential = false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => rpcResultFor(false) }));
    const { hasVerifiedCredential } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: VERIFIER_ID });

    const result = await hasVerifiedCredential('GDADWBOR6X5G46VCK6UWD46JSNQGDCS5SODHLVRMMOWX6NE34DYTVE5E');

    expect(result).toBe(false);
  });

  it('fails closed to false (not thrown) when Soroban RPC returns a JSON-RPC error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'boom' } }) })
    );
    const { hasVerifiedCredential } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: VERIFIER_ID });

    await expect(hasVerifiedCredential('GDADWBOR6X5G46VCK6UWD46JSNQGDCS5SODHLVRMMOWX6NE34DYTVE5E')).resolves.toBe(false);
  });

  it('fails closed to false (not thrown) when the network call itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { hasVerifiedCredential } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: VERIFIER_ID });

    await expect(hasVerifiedCredential('GDADWBOR6X5G46VCK6UWD46JSNQGDCS5SODHLVRMMOWX6NE34DYTVE5E')).resolves.toBe(false);
  });

  it('caches a verified result so a second call for the same address makes no extra network call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => rpcResultFor(true) });
    vi.stubGlobal('fetch', fetchMock);
    const { hasVerifiedCredential, clearZkidentCache } = await freshModule({ ZKIDENT_CREDENTIAL_VERIFIER_ID: VERIFIER_ID });
    clearZkidentCache();

    const user = 'GAUZ4T6UT7XMGOL6WYPWWSYPZQ7ZLILCAS2ROYCH5ILHHOWQYUGVRTAB';
    await hasVerifiedCredential(user);
    await hasVerifiedCredential(user);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
