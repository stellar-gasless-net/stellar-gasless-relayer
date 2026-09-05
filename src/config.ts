export interface RelayerConfig {
  port: number;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  relayerSecrets: string[];
  maxFeeStroops: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  dappApiKeys: string[];
}

export function loadConfig(): RelayerConfig {
  const relayerSecrets = (process.env.RELAYER_SECRETS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const dappApiKeys = (process.env.DAPP_API_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    // Horizon: classic ledger data + transaction submission (FeeBumpTransaction goes here).
    horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
    // Soroban RPC is a separate service from Horizon; it's what actually simulates
    // contract invocations before we sponsor the fee for one.
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    networkPassphrase: process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    relayerSecrets,
    maxFeeStroops: process.env.MAX_FEE_STROOPS || '1000000',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10),
    dappApiKeys,
  };
}
