export interface RelayerConfig {
  port: number;
  horizonUrl: string;
  networkPassphrase: string;
  relayerSecrets: string[];
  maxFeeStroops: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export function loadConfig(): RelayerConfig {
  return {
    port: parseInt(process.env.PORT || '3001', 10),
    horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
    networkPassphrase: process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    relayerSecrets: (process.env.RELAYER_SECRETS || 'SDXXX...KEY1,SDYYY...KEY2').split(','),
    maxFeeStroops: process.env.MAX_FEE_STROOPS || '1000000',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10),
  };
}
