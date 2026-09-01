import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FeeBumpRelayer } from './relayer/fee_bump';
import { KeypairPoolQueue } from './relayer/queue';
import { SorobanSimulator } from './relayer/simulation';
import { rateLimitMiddleware } from './middleware/rate_limit';
import { RelayerLogger } from './middleware/logger';
import { telemetry } from './telemetry/metrics';
import { loadConfig } from './config';

dotenv.config();

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

// Throws immediately (and loudly) on any malformed secret, instead of the relayer
// silently falling back to a random keypair that can never actually pay fees.
const keypairPool = new KeypairPoolQueue(config.relayerSecrets);

const relayer = new FeeBumpRelayer(config.horizonUrl, config.networkPassphrase, config.maxFeeStroops);
const simulator = new SorobanSimulator(config.sorobanRpcUrl);

const app = express();
app.use(cors());
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
app.post('/v1/relay', rateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { innerTransactionXdr, dappApiKey, paymasterAddress } = req.body;
    if (!innerTransactionXdr) {
      return res.status(400).json({ error: 'Missing innerTransactionXdr payload' });
    }

    // Pre-flight simulation: reject failing invocations before we spend anything sponsoring them.
    const simulation = await simulator.simulateTransaction(innerTransactionXdr);
    if (!simulation.isSuccess) {
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
    telemetry.recordSuccess(100);
    RelayerLogger.logTransactionSuccess(txResult.hash, config.networkPassphrase.includes('Public') ? 'public' : 'testnet');

    return res.json({
      success: true,
      hash: txResult.hash,
      resultXdr: txResult.result_xdr,
    });
  } catch (error: any) {
    telemetry.recordFailure();
    RelayerLogger.error('Relay transaction submission failed', { message: error.message });
    return res.status(500).json({
      success: false,
      error: error.message || 'Relay transaction submission failed',
    });
  }
});

app.listen(config.port, () => {
  console.log(`Stellar Gasless Relayer service online on port ${config.port}`);
  console.log(`Sponsoring keypair pool size: ${keypairPool.getPoolSize()}`);
});
