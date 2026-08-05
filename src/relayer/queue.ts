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
   * Rotate and return the next keypair to sponsor fee-bump to avoid sequence number conflicts
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
