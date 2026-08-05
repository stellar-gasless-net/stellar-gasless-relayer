# ⚡ Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20-green.svg?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![Stellar SDK](https://img.shields.io/badge/Stellar--SDK-v12.0.0-purple.svg?style=for-the-badge&logo=stellar)](https://stellar.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg?style=for-the-badge&logo=docker)](Dockerfile)

High-throughput, enterprise-grade Backend Relayer Engine & `FeeBumpTransaction` submitter for **Stellar & Soroban**.

---

## 🏛️ System Architecture & Workflow

```
 [ Client / SDK ] ──(1) POST /v1/relay (Signed Inner Tx XDR)──► [ Express API Server ]
                                                                       │
                                                               (2) Rate Limiting & Auth
                                                                       │
                                                                       v
 [ Soroban RPC ]  ◄──(3) Simulate Execution & Estimate Gas─── [ Simulation Engine ]
                                                                       │
                                                               (4) Rotate Keypair Pool
                                                                       │
                                                                       v
 [ Stellar RPC ]  ◄──(5) Broadcast FeeBumpTransaction ─────── [ Keypair Pool Queue ]
```

---

## 🚀 Key Features

* **Native Fee Delegation**: Wraps signed inner user transactions into native Stellar `FeeBumpTransaction` instances.
* **Keypair Pool Queue Rotation**: Rotates a pool of relayer keypairs to prevent Horizon sequence number race conditions under high concurrent load.
* **Pre-Flight Soroban Simulation**: Dry-runs transactions against RPC before broadcasting to ensure CPU instructions & memory footprint are within budget.
* **Sliding Window Throttling**: Built-in IP rate limiter and dApp API Key validation middleware.
* **Prometheus Metrics**: Exposes operational telemetry at `/metrics` (relayed count, Stroops spent, keypair balances).
* **Production Dockerized**: Multi-stage Docker build ready for Kubernetes / AWS ECS / Railway deployment.

---

## 📡 REST API OpenAPI Specification

### `POST /v1/relay`
Submits an inner user-signed transaction to be wrapped in a fee bump transaction.

**Request Headers:**
```http
Content-Type: application/json
X-API-Key: st_gas_live_your_key_here
```

**Request Body:**
```json
{
  "innerTransactionXdr": "AAAAAgAAAAD...",
  "dappApiKey": "st_gas_live_your_key_here"
}
```

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "hash": "0x7f8a12c9...",
  "resultXdr": "AAAAAgAAAAE..."
}
```

---

## ⚙️ Environment Variables Matrix

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3001` | HTTP server listening port |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | Stellar Horizon node RPC URL |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Stellar Network Passphrase |
| `RELAYER_SECRETS` | `SDXXX...,SDYYY...` | Comma-separated secret keys for keypair queue pool |
| `MAX_FEE_STROOPS` | `1000000` | Max fee willing to sponsor per transaction in Stroops |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Max gasless requests allowed per minute per client |

---

## 🛠️ Development & Deployment

### Local Development
```bash
npm install
npm run dev
```

### Docker Container Deployment
```bash
docker build -t stellar-gasless-relayer .
docker run -p 3001:3001 --env-file .env stellar-gasless-relayer
```

### Docker Compose
```bash
docker-compose up -d
```
