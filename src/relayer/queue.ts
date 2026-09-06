import { Keypair } from '@stellar/stellar-sdk';

export class KeypairPoolQueue {
  private keypairs: Keypair[];
  private currentIndex: number = 0;

  constructor(secretKeys: string[]) {
    if (!secretKeys || secretKeys.length === 0) {
      throw new Error('KeypairPoolQueue requires at least one secret key');
    }
    this.keypairs = secretKeys.map((secret) => Keypair.fromSecret(secret));
  }

  /**
   * Rotate and return the next sponsor keypair. NOT about sequence-number conflicts — a
   * fee-bump transaction's `feeSource` has no sequence number of its own (only the inner
   * transaction's source account does, per CAP-15), so reusing one sponsor concurrently
   * can't cause a sequence conflict either way. This spreads submission throughput and
   * operational XLM balance across several funded accounts instead of one.
   */
  getNextKeypair(): Keypair {
    const keypair = this.keypairs[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.keypairs.length;
    return keypair;
  }

  /**
   * Get total pool size
   */
  getPoolSize(): number {
    return this.keypairs.length;
  }
}
