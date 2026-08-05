# `stellar-gasless-relayer`

High-performance Relayer Service and `FeeBumpTransaction` Engine for **Stellar & Soroban**.

## 🚀 Features

- **Native Fee Sponsoring**: Wraps off-chain signed Soroban transactions into native Stellar `FeeBumpTransaction` instances.
- **REST API**: Exposes clean JSON endpoints `/v1/relay` and `/v1/estimate-gas` for frontend SDK consumption.
- **Rate-Limiting & API Key Auth**: Protection against spam and unauthorized dApp usage.

## 🛠️ Running Locally

```bash
npm install
npm run dev
```
