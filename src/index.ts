// Must be the very first import. ES module imports fully evaluate each imported module's
// own top-level code, in order, before this file's body runs — so `rate_limit.ts` and
// `api_key.ts` below both call loadConfig() at their own module top level, which happens
// *during* their import statements, before a dotenv.config() call later in this file would
// ever run. Importing the side-effecting 'dotenv/config' entry point first guarantees
// process.env is populated from .env before anything else in this file is even parsed.
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { FeeBumpRelayer } from './relayer/fee_bump';
import { KeypairPoolQueue } from './relayer/queue';
import { SorobanSimulator } from './relayer/simulation';
import { apiKeyMiddleware } from './middleware/api_key';
import { rateLimitMiddleware } from './middleware/rate_limit';
import { spendBudgetMiddleware, releaseReservedBudget } from './middleware/spend_budget';
import { buildCorsOptions } from './cors_config';
import { RelayerLogger } from './middleware/logger';
import { telemetry } from './telemetry/metrics';
import { loadConfig } from './config';

const config = loadConfig();

if (config.relayerSecrets.length === 0) {
  console.error(
    'FATAL: no RELAYER_SECRETS configured. Set a comma-separated list of Stellar secret ' +
    'keys (e.g. "SD...1,SD...2") in your environment before starting the relayer. ' +
    'Refusing to start with no sponsoring keypair rather than silently generating a ' +
    'throwaway one with a zero balance.'
  );
  process.exit(1);
}

if (config.dappApiKeys.length === 0) {
  console.error(
    'FATAL: no DAPP_API_KEYS configured. Set a comma-separated list of keys you issue to ' +
    'integrating dApps (e.g. "st_gas_live_abc,st_gas_live_def") before starting the ' +
    'relayer. Refusing to start with an empty allowlist rather than silently accepting ' +
    'requests from anyone.'
  );
  process.exit(1);
}

if (config.corsOrigins.length === 0) {
  console.warn(
    'WARNING: no CORS_ORIGINS configured — this relayer accepts direct browser requests ' +
    'from ANY website, not just your own dashboard/dApp. Fine for local development; set ' +
    'CORS_ORIGINS to a comma-separated allowlist (e.g. "https://your-dapp.example") before ' +
    'a real deployment. Not a hard failure, since some deployments are server-to-server ' +
    'only and never receive a browser Origin header at all.'
  );
}

// Throws immediately (and loudly) on any malformed secret, instead of the relayer
// silently falling back to a random keypair that can never actually pay fees.
const keypairPool = new KeypairPoolQueue(config.relayerSecrets);

const relayer = new FeeBumpRelayer(config.horizonUrl, config.networkPassphrase, config.maxFeeStroops);
const simulator = new SorobanSimulator(config.sorobanRpcUrl);

const app = express();
app.use(cors(buildCorsOptions(config.corsOrigins)));
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'stellar-gasless-relayer',
    version: '1.0.0',
    keypairPoolSize: keypairPool.getPoolSize(),
  });
});

// Prometheus-format telemetry endpoint (real exposition format, not JSON)
app.get('/metrics', (req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(telemetry.getPrometheusText());
});

// JSON telemetry, for dashboards/tooling that would rather not parse Prometheus text
app.get('/metrics.json', (req: Request, res: Response) => {
  res.json(telemetry.getMetrics());
});

// Main Gasless Relay Endpoint
app.post('/v1/relay', apiKeyMiddleware, rateLimitMiddleware, spendBudgetMiddleware, async (req: Request, res: Response) => {
  // Same derivation apiKeyMiddleware/spendBudgetMiddleware used, so this always matches the
  // key spendBudgetMiddleware already reserved the fee-bump bid against for this request.
  const headerKey = req.headers['x-api-key'];
  const apiKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || req.body?.dappApiKey || 'unknown';

  try {
    const { innerTransactionXdr, dappApiKey, paymasterAddress } = req.body;
    if (!innerTransactionXdr) {
      releaseReservedBudget(apiKey);
      return res.status(400).json({ error: 'Missing innerTransactionXdr payload' });
    }

    // Pre-flight simulation: reject failing invocations before we spend anything sponsoring them.
    const simulation = await simulator.simulateTransaction(innerTransactionXdr);
    if (!simulation.isSuccess) {
      releaseReservedBudget(apiKey);
      return res.status(400).json({
        success: false,
        error: `Soroban simulation failed, not sponsoring: ${simulation.error}`,
      });
    }

    const sponsorKeypair = keypairPool.getNextKeypair();
    const txResult = await relayer.relayTransaction(
      { innerTransactionXdr, dappApiKey, paymasterAddress },
      sponsorKeypair
    );
    // The real fee-bump bid — the actual fee_charged isn't in Horizon's immediate submit
    // response (only a later fetch-by-hash returns it), so this is the same conservative
    // figure spendBudgetMiddleware already reserved against, not a placeholder. Nothing
    // further to record here: the reservation itself IS this relay's recorded spend.
    const feeBidStroops = parseInt(config.maxFeeStroops, 10);
    telemetry.recordSuccess(feeBidStroops);
    RelayerLogger.logTransactionSuccess(txResult.hash, config.networkPassphrase.includes('Public') ? 'public' : 'testnet');

    return res.json({
      success: true,
      hash: txResult.hash,
      resultXdr: txResult.result_xdr,
    });
  } catch (error: any) {
    releaseReservedBudget(apiKey);
    telemetry.recordFailure();
    // Horizon's own SDK throws an axios error whose generic `.message` (e.g. "Request
    // failed with status code 400") hides the actual reason — the real cause lives in
    // `error.response.data.extras.result_codes`. Surface that when present so SDK users
    // aren't left debugging a meaningless HTTP status code.
    const resultCodes = error.response?.data?.extras?.result_codes;
    const detail = resultCodes ? JSON.stringify(resultCodes) : error.message;
    RelayerLogger.error('Relay transaction submission failed', { message: detail });
    return res.status(500).json({
      success: false,
      error: detail || 'Relay transaction submission failed',
    });
  }
});

app.listen(config.port, () => {
  console.log(`Stellar Gasless Relayer service online on port ${config.port}`);
  console.log(`Sponsoring keypair pool size: ${keypairPool.getPoolSize()}`);
});
