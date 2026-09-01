export interface SimulationResult {
  isSuccess: boolean;
  minResourceFeeStroops?: string;
  cpuInstructions?: number;
  memoryBytes?: number;
  error?: string;
}

/**
 * Calls the Soroban RPC `simulateTransaction` JSON-RPC method to get a real
 * pre-flight resource/fee estimate and catch failing invocations before the
 * relayer spends anything sponsoring them.
 *
 * This talks to Soroban RPC, not Horizon — they're different services. See
 * https://developers.stellar.org/docs/data/rpc/api-reference/methods/simulateTransaction
 */
export class SorobanSimulator {
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async simulateTransaction(innerTxXdr: string): Promise<SimulationResult> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'simulateTransaction',
          params: { transaction: innerTxXdr },
        }),
      });

      const body = await response.json();

      if (body.error) {
        return {
          isSuccess: false,
          error: body.error.message || 'Soroban RPC returned an error',
        };
      }

      const result = body.result;
      if (!result) {
        return { isSuccess: false, error: 'Soroban RPC returned no result' };
      }

      if (result.error) {
        return { isSuccess: false, error: String(result.error) };
      }

      return {
        isSuccess: true,
        minResourceFeeStroops: result.minResourceFee,
        cpuInstructions: result.cost ? Number(result.cost.cpuInsns) : undefined,
        memoryBytes: result.cost ? Number(result.cost.memBytes) : undefined,
      };
    } catch (err: any) {
      return {
        isSuccess: false,
        error: err.message || 'Soroban RPC simulation request failed',
      };
    }
  }
}
