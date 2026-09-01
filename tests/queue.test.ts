import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { KeypairPoolQueue } from '../src/relayer/queue';

describe('KeypairPoolQueue', () => {
  it('throws if constructed with no secrets', () => {
    expect(() => new KeypairPoolQueue([])).toThrow();
  });

  it('throws immediately on a malformed secret instead of silently accepting it', () => {
    expect(() => new KeypairPoolQueue(['SDXXX...NOT_A_REAL_KEY'])).toThrow();
  });

  it('rotates through all keypairs before repeating', () => {
    const secrets = [Keypair.random().secret(), Keypair.random().secret(), Keypair.random().secret()];
    const pool = new KeypairPoolQueue(secrets);

    const seen = [
      pool.getNextKeypair().publicKey(),
      pool.getNextKeypair().publicKey(),
      pool.getNextKeypair().publicKey(),
    ];
    const expected = secrets.map((s) => Keypair.fromSecret(s).publicKey());

    expect(seen).toEqual(expected);
    // Should wrap back to the first keypair on the 4th call.
    expect(pool.getNextKeypair().publicKey()).toBe(expected[0]);
  });

  it('reports the correct pool size', () => {
    const secrets = [Keypair.random().secret(), Keypair.random().secret()];
    const pool = new KeypairPoolQueue(secrets);
    expect(pool.getPoolSize()).toBe(2);
  });
});
