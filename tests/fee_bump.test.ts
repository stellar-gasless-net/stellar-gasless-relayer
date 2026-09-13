import { describe, it, expect } from 'vitest';
import { FeeBumpRelayer } from '../src/relayer/fee_bump';

describe('FeeBumpRelayer.perOperationBaseFee', () => {
  it('a single-operation inner transaction is charged exactly maxFeeStroops, not double it', () => {
    // The real bug this guards against: TransactionBuilder.buildFeeBumpTransaction's
    // baseFee is a PER-OPERATION rate — passing maxFeeStroops straight through as baseFee
    // (the old behavior) would make the real total 2x maxFeeStroops for a 1-op inner tx.
    const baseFee = FeeBumpRelayer.perOperationBaseFee('1000000', 1);
    const realTotalCharged = Number(baseFee) * (1 + 1);
    expect(realTotalCharged).toBe(1000000);
  });

  it('a multi-operation inner transaction still totals to at most maxFeeStroops', () => {
    const innerOps = 3;
    const baseFee = FeeBumpRelayer.perOperationBaseFee('1000000', innerOps);
    const realTotalCharged = Number(baseFee) * (innerOps + 1);
    expect(realTotalCharged).toBeLessThanOrEqual(1000000);
    // Flooring should leave at most (innerOps + 1) - 1 stroops of unused headroom, not more.
    expect(1000000 - realTotalCharged).toBeLessThan(innerOps + 1);
  });

  it('floors rather than rounds up, so the real charge never exceeds the configured cap', () => {
    // 1000001 / 2 = 500000.5 — flooring must land on 500000, not round up to 500001
    // (which would make the real total 1000002, exceeding the configured maxFeeStroops).
    const baseFee = FeeBumpRelayer.perOperationBaseFee('1000001', 1);
    expect(baseFee).toBe('500000');
    expect(Number(baseFee) * 2).toBeLessThanOrEqual(1000001);
  });
});
