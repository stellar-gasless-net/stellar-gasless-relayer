import { Keypair, TransactionBuilder, Transaction, FeeBumpTransaction, Horizon } from '@stellar/stellar-sdk';

export interface RelayRequest {
  innerTransactionXdr: string;
  paymasterAddress?: string;
  dappApiKey: string;
}

export class FeeBumpRelayer {
  private relayerKeypair: Keypair;
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor(relayerSecret: string, horizonUrl: string, networkPassphrase: string) {
    try {
      this.relayerKeypair = Keypair.fromSecret(relayerSecret);
    } catch (err) {
      // Fallback to random valid keypair if secret is missing or placeholder
      this.relayerKeypair = Keypair.random();
    }
    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = networkPassphrase;
  }

  public getPublicKey(): string {
    return this.relayerKeypair.publicKey();
  }

  /**
   * Wrap signed inner user transaction into a Stellar FeeBumpTransaction and submit to network
   */
  async relayTransaction(request: RelayRequest): Promise<Horizon.ServerApi.TransactionRecord | any> {
    const innerTx = TransactionBuilder.fromXDR(request.innerTransactionXdr, this.networkPassphrase) as Transaction;
    
    // Construct fee bump transaction sponsored by relayer keypair
    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      this.relayerKeypair,
      '1000000', // Maximum fee willing to pay in stroops
      innerTx,
      this.networkPassphrase
    );

    feeBumpTx.sign(this.relayerKeypair);

    // Submit transaction to Horizon / RPC node
    return await this.server.submitTransaction(feeBumpTx);
  }
}
