import { Keypair, TransactionBuilder, Transaction, Horizon } from '@stellar/stellar-sdk';

export interface RelayRequest {
  innerTransactionXdr: string;
  paymasterAddress?: string;
  dappApiKey: string;
}

export class FeeBumpRelayer {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private maxFeeStroops: string;

  constructor(horizonUrl: string, networkPassphrase: string, maxFeeStroops: string) {
    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = networkPassphrase;
    this.maxFeeStroops = maxFeeStroops;
  }

  /**
   * Wrap a signed inner user transaction into a Stellar FeeBumpTransaction, sign it with
   * the given sponsoring keypair, and submit it to the network.
   *
   * The sponsoring keypair is supplied per-call (rather than fixed at construction) so callers
   * can rotate through a KeypairPoolQueue, spreading submission throughput and operational
   * balance across several funded accounts instead of one — see KeypairPoolQueue's own doc
   * comment for why this is NOT about sequence-number conflicts (a fee-bump's feeSource has
   * no sequence number of its own).
   */
  async relayTransaction(request: RelayRequest, sponsorKeypair: Keypair): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const innerTx = TransactionBuilder.fromXDR(request.innerTransactionXdr, this.networkPassphrase) as Transaction;

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      FeeBumpRelayer.perOperationBaseFee(this.maxFeeStroops, innerTx.operations.length),
      innerTx,
      this.networkPassphrase
    );

    feeBumpTx.sign(sponsorKeypair);

    return await this.server.submitTransaction(feeBumpTx);
  }

  /**
   * `TransactionBuilder.buildFeeBumpTransaction`'s `baseFee` argument is a PER-OPERATION
   * rate, not a flat total — it sets the outer transaction's real charged fee to
   * `baseFee * (innerOps + 1)` (confirmed directly in @stellar/stellar-base's own source).
   * Passing `maxFeeStroops` straight through as `baseFee` — this function's only caller
   * used to do exactly that — meant every relay of a (typical) 1-op inner transaction
   * actually charged the sponsor keypair 2x the configured budget, silently, since
   * spend_budget.ts and the /metrics endpoints both assume the flat configured value IS
   * the real charge.
   *
   * Floors rather than rounds up, so the real total (`baseFee * (innerOps + 1)`) never
   * EXCEEDS `maxFeeStroops` — a budget cap should never let the real charge run over the
   * configured ceiling, even by a few stroops of rounding. If `maxFeeStroops` is too small
   * relative to the inner transaction's own operation count (or its own declared fee rate),
   * `buildFeeBumpTransaction` itself throws a clear "Invalid baseFee" error — a real
   * misconfiguration surfacing loudly, not something to silently paper over here.
   */
  static perOperationBaseFee(maxFeeStroops: string, innerOperationCount: number): string {
    const totalOperations = innerOperationCount + 1; // +1 for the fee-bump wrapper itself
    const perOp = Math.floor(Number(maxFeeStroops) / totalOperations);
    return perOp.toString();
  }
}
