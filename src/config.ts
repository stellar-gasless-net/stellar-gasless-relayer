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
  /** 0 means unlimited — a global daily cap is a real safety net, not a required one; a
   * fresh local/dev setup shouldn't be forced to configure one just to start. */
  globalDailyBudgetStroops: number;
  /** 0 means unlimited — same reasoning as globalDailyBudgetStroops, scoped per API key. */
  perKeyDailyBudgetStroops: number;
  /** Empty means "allow any origin" (the same default Express's bare cors() has). Configuring
   * this is what actually restricts which browser origins can call this relayer directly. */
  corsOrigins: string[];
  /** Empty (the default) disables the zkident credential tiering integration entirely — every
   * user is treated identically, same as before it existed. Set to a real deployed
   * stellar-zklab/stellar-zkident credential_verifier contract ID to enable it. See
   * relayer/zkident.ts. */
  zkidentCredentialVerifierId: string;
  /** Which credential_type a user must hold a verified credential_verifier record for to
   * qualify for the verified-tier sponsorship cap. Only meaningful when
   * zkidentCredentialVerifierId is set. */
  zkidentRequiredCredentialType: string;
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

  const corsOrigins = (process.env.CORS_ORIGINS || '')
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
    globalDailyBudgetStroops: parseInt(process.env.GLOBAL_DAILY_BUDGET_STROOPS || '0', 10),
    perKeyDailyBudgetStroops: parseInt(process.env.PER_KEY_DAILY_BUDGET_STROOPS || '0', 10),
    corsOrigins,
    zkidentCredentialVerifierId: process.env.ZKIDENT_CREDENTIAL_VERIFIER_ID || '',
    zkidentRequiredCredentialType: process.env.ZKIDENT_REQUIRED_CREDENTIAL_TYPE || 'kyc_tier_2',
  };
}
