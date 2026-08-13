# Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

**High-throughput, enterprise TypeScript Relayer Engine managing multi-keypair pool rotation, Soroban RPC simulation, native fee-bump transaction wrapping, and Prometheus telemetry metrics.**

This repository houses the **Backend Infrastructure & Transaction Submitter Engine** for the [`stellar-gasless-net`](https://github.com/stellar-gasless-net) ecosystem.

---

## Relayer Engine Architecture & Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      stellar-gasless-relayer Service                            │
│                                                                                 │
│  ┌───────────────────────────┐                 ┌─────────────────────────────┐  │
│  │   REST API (/v1/relay)    │                 │   Rate Limiter & API Keys   │  │
│  │ (Receives Client Intents) │────────────────►│   (Sliding Window Limits)   │  │
│  └─────────────┬─────────────┘                 └──────────────┬──────────────┘  │
│                │                                              │                 │
│                v                                              v                 │
│  ┌───────────────────────────┐                 ┌─────────────────────────────┐  │
│  │   Soroban RPC Simulator   │                 │ Multi-Keypair Account Queue │  │
│  │ (Pre-flight Dry Runs)     │                 │ (Sequence Collision Guard)  │  │
│  └─────────────┬─────────────┘                 └──────────────┬──────────────┘  │
│                │                                              │                 │
│                └──────────────────────┬───────────────────────┘                 │
│                                       │                                         │
│                                       v                                         │
│                        ┌──────────────────────────────┐                         │
│                        │     FeeBumpTx Constructor    │                         │
│                        │ (Signs as Fee Sponsor & POST)│                         │
│                        └──────────────┬───────────────┘                         │
└───────────────────────────────────────┼─────────────────────────────────────────┘
                                        │ Broadcasts over HTTP
                                        v
                            ┌─────────────────────────┐
                            │ Horizon Testnet RPC Node│
                            └─────────────────────────┘
```

---

## Detailed Component Capabilities

### 1. Multi-Keypair Queue Manager (`src/relayer/queue.ts`)
* **Race Condition Prevention**: Rotates sponsoring keypairs from a secret pool (`GCRELAY_POOL_KEY_1`, `GCRELAY_POOL_KEY_2`) to prevent sequence number collisions during transaction bursts.

### 2. Soroban RPC Simulator (`src/relayer/simulation.ts`)
* **Pre-Flight Dry Run**: Executes dry runs against Horizon RPC (`https://horizon-testnet.stellar.org`) to verify transaction validity and estimate Stroops gas cost before broadcasting.

### 3. FeeBump Builder (`src/relayer/fee_bump.ts`)
* **Stellar Fee Sponsorship**: Constructs native `FeeBumpTransaction` instances, wrapping inner signed user payloads and signing as Fee Sponsor.

### 4. Prometheus Telemetry (`src/telemetry/metrics.ts`)
* **Metrics Exporter**: Exposes `/metrics` endpoint recording total relayed transactions, XLM Stroops spent, active queue length, and server uptime.

---

## Environment Configuration Matrix

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Relayer API HTTP listening port | `3000` |
| `SOROBAN_RPC_URL` | Stellar / Soroban Horizon RPC node URL | `https://horizon-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | Stellar Network Passphrase | `Test SDF Network ; September 2015` |
| `SPONSOR_SECRET_KEYS` | Comma-separated secret keys for keypair pool | `SD...1,SD...2` |

---

## Contributing & `CONTRIBUTING.md` Guidelines

Please review our dedicated **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** guide before opening pull requests:
* **[Backend Relayer Contributor Guide](./CONTRIBUTING.md)**
* **[Security Disclosure Policy](./SECURITY.md)**

### Pull Request Checklist:
- [ ] Claim an issue tagged `good first issue`, `intermediate`, or `advanced`.
- [ ] Run `npm test` and ensure all TypeScript files compile cleanly (`npm run build`).
- [ ] Follow Conventional Commits format (`feat: ...`, `fix: ...`, `docs: ...`).

---

## Future Improvements & Relayer Roadmap

- [ ] **Decentralized Bundler Node Network**: Peer-to-peer relayer node network incentivized via fee splits.
- [ ] **Redis Distributed Queue Manager**: Redis-backed queue manager supporting horizontal scaling across cloud instances.
- [ ] **WebHook Event Notifications**: WebHook dispatch engine notifying dApps upon transaction confirmation.
