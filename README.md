# ⚡ Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

**High-throughput, enterprise TypeScript Relayer Engine managing multi-keypair pool rotation, Soroban RPC simulation, native fee-bump transaction wrapping, and Prometheus telemetry metrics.**

This service is the backend relayer engine of the [`stellar-gasless-net`](https://github.com/stellar-gasless-net) ecosystem.

---

## 🛠️ Engine Architecture & Components

* **Multi-Keypair Queue (`queue.ts`)**: Rotates account keypairs from a secret pool to eliminate sequence number collision race conditions under heavy transaction bursts.
* **FeeBump Wrapper (`fee_bump.ts`)**: Constructs native Stellar `FeeBumpTransaction` instances, signing as Fee Sponsor for zero-gas user calls.
* **Soroban RPC Simulator (`simulation.ts`)**: Executes pre-flight dry runs against Soroban RPC nodes (`https://horizon-testnet.stellar.org`) to verify transaction validity before broadcasting.
* **Rate Limiter & API Key Validator (`rate_limit.ts`)**: Sliding-window rate limiting per IP / API key.
* **Prometheus Telemetry Exporter (`metrics.ts`)**: Exposes `/metrics` endpoint for real-time Prometheus monitoring of relayed count, Stroops spent, and uptime.

---

## 🚀 Local Development Setup

```bash
npm install
cp .env.example .env
npm run dev
```

---

## 🤝 Contributing & Governance

Please read our enterprise contributor guidelines before submitting PRs:
* 📖 **[Relayer Engine Contributor Guide](./CONTRIBUTING.md)**
* 🛡️ **[Security Policy](./SECURITY.md)**
