# Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

**TypeScript relayer service: takes a signed inner Stellar transaction, wraps it in a `FeeBumpTransaction` sponsored by a rotating pool of keypairs, pre-flight simulates it via Soroban RPC, and submits it.**

**Current status:** this is a working Express service you can run yourself (`npm run dev`), with real unit tests (`npm test`) and CI. It is **not deployed anywhere public** — no hosted URL exists yet.

**Real, independently-verified end-to-end proof (2026-09-04):** run locally against a real funded `RELAYER_SECRETS` keypair, this service was proven to actually sponsor a real transaction end-to-end for the first time — see [`stellar-gasless-sdk`'s `examples/e2e-gasless-relay.mjs`](https://github.com/stellar-gasless-net/stellar-gasless-sdk/blob/main/examples/e2e-gasless-relay.mjs), which drives this relayer with the real SDK client against a real deployed contract. Confirmed independently via Horizon's own transaction record (not just this service's own success response): the configured sponsor's account was the transaction's real `fee_account` and lost the real network fee, while the calling user's account balance never moved. This same test caught and fixed a real bug here: `/v1/relay`'s error handling was surfacing Horizon's generic axios message (`"Request failed with status code 400"`) instead of the actual `result_codes` (e.g. `tx_bad_auth`, `tx_too_late`) that explain what actually went wrong — fixed in `src/index.ts`'s catch handler to extract `error.response?.data?.extras?.result_codes` when present.

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
* **Race Condition Prevention**: Rotates sponsoring keypairs from `RELAYER_SECRETS` on every `/v1/relay` call, so bursts of requests don't collide on the same account's sequence number. Fails fast at startup (not silently) if no valid secrets are configured.

### 2. Soroban RPC Simulator (`src/relayer/simulation.ts`)
* **Pre-Flight Dry Run**: Calls Soroban RPC's `simulateTransaction` method (a separate service from Horizon — see `SOROBAN_RPC_URL` below) to get real resource-cost estimates and reject failing invocations *before* the relayer spends a fee sponsoring them. Runs on every `/v1/relay` request.

### 3. FeeBump Builder (`src/relayer/fee_bump.ts`)
* **Stellar Fee Sponsorship**: Constructs native `FeeBumpTransaction` instances, wrapping inner signed user payloads and signing as Fee Sponsor with whichever keypair the queue hands it.

### 4. Telemetry (`src/telemetry/metrics.ts`)
* **`/metrics`**: real Prometheus text exposition format — relayed/failed counters, stroops spent, uptime.
* **`/metrics.json`**: the same counters as JSON, for tooling that doesn't want to parse Prometheus text.

---

## Environment Configuration Matrix

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Relayer API HTTP listening port | `3001` |
| `HORIZON_URL` | Horizon node URL — classic ledger data & transaction submission | `https://horizon-testnet.stellar.org` |
| `SOROBAN_RPC_URL` | Soroban RPC node URL — a *separate* service from Horizon, used only for `simulateTransaction` | `https://soroban-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | Stellar Network Passphrase | `Test SDF Network ; September 2015` |
| `RELAYER_SECRETS` | Comma-separated Stellar secret keys for the sponsoring keypair pool. Required — the service refuses to start without at least one valid key. | `SD...1,SD...2` |
| `MAX_FEE_STROOPS` | Max fee the relayer will bid per fee-bump, in stroops | `1000000` |

---

## Contributing & `CONTRIBUTING.md` Guidelines

Please review our dedicated **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** guide before opening pull requests:
* **[Backend Relayer Contributor Guide](./CONTRIBUTING.md)**
* **[Security Disclosure Policy](./SECURITY.md)**

### Pull Request Checklist:
- [ ] Claim an issue tagged `good first issue`, `intermediate`, or `advanced`.
- [ ] Run `npm test` (vitest) and ensure all TypeScript files compile cleanly (`npm run build`).
- [ ] Follow Conventional Commits format (`feat: ...`, `fix: ...`, `docs: ...`).

---

## Future Improvements & Relayer Roadmap

- [ ] **Deploy a public instance**: nothing is hosted yet — this only runs locally/self-hosted today.
- [ ] **API key issuance & auth**: `/v1/relay` currently accepts `dappApiKey` in the body but doesn't validate it against anything real yet.
- [ ] **Decentralized Bundler Node Network**: Peer-to-peer relayer node network incentivized via fee splits.
- [ ] **Redis Distributed Queue Manager**: Redis-backed queue manager supporting horizontal scaling across cloud instances.
- [ ] **WebHook Event Notifications**: WebHook dispatch engine notifying dApps upon transaction confirmation.
