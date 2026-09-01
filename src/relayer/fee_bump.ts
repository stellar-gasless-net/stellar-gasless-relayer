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
   * can rotate through a KeypairPoolQueue and avoid sequence-number collisions under load.
   */
  async relayTransaction(request: RelayRequest, sponsorKeypair: Keypair): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const innerTx = TransactionBuilder.fromXDR(request.innerTransactionXdr, this.networkPassphrase) as Transaction;

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      this.maxFeeStroops,
      innerTx,
      this.networkPassphrase
    );

    feeBumpTx.sign(sponsorKeypair);

    return await this.server.submitTransaction(feeBumpTx);
  }
}
