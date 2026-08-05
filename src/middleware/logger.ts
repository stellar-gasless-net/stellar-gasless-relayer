export class RelayerLogger {
  static info(message: string, meta?: any) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  }

  static warn(message: string, meta?: any) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  }

  static error(message: string, meta?: any) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : '');
  }

  static logTransactionSuccess(txHash: string, network: string = 'testnet') {
    const explorerUrl = `https://stellar_expert.com/explorer/${network}/tx/${txHash}`;
    console.log(`[SUCCESS] ⚡ FeeBump Transaction Broadcast Success!`);
    console.log(`[EXPLORER] 🔗 ${explorerUrl}`);
  }
}
