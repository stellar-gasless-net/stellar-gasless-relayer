import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FeeBumpRelayer } from './relayer/fee_bump';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const RELAYER_SECRET = process.env.RELAYER_SECRET || 'SDXXX...RELAYER_KEY'; // Demo secret

const relayer = new FeeBumpRelayer(RELAYER_SECRET, HORIZON_URL, NETWORK_PASSPHRASE);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'stellar-gasless-relayer', version: '1.0.0' });
});

app.post('/v1/relay', async (req: Request, res: Response) => {
  try {
    const { innerTransactionXdr, dappApiKey } = req.body;
    if (!innerTransactionXdr) {
      return res.status(400).json({ error: 'Missing innerTransactionXdr payload' });
    }

    const txResult = await relayer.relayTransaction({ innerTransactionXdr, dappApiKey });
    return res.json({ success: true, hash: txResult.hash, resultXdr: txResult.result_xdr });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Relay transaction submission failed' });
  }
});

app.listen(PORT, () => {
  console.log(`⚡ Stellar Gasless Relayer running on port ${PORT}`);
});
