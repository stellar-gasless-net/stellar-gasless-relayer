export interface RelayRequestPayload {
  innerTransactionXdr: string;
  dappApiKey: string;
  paymasterAddress?: string;
}

export interface RelayResponsePayload {
  success: boolean;
  hash?: string;
  resultXdr?: string;
  error?: string;
}

export interface RelayerMetricsResponse {
  totalRelayed: number;
  totalFailed: number;
  totalStroopsSpent: number;
  totalXlmSpent: string;
  uptimeSeconds: number;
}
