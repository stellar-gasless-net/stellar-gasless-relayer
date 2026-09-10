# Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

[![CI](https://github.com/stellar-gasless-net/stellar-gasless-relayer/actions/workflows/ci.yml/badge.svg)](https://github.com/stellar-gasless-net/stellar-gasless-relayer/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

**TypeScript relayer service: takes a signed inner Stellar transaction, wraps it in a `FeeBumpTransaction` sponsored by a rotating pool of keypairs, pre-flight simulates it via Soroban RPC, and submits it.**

**Current status:** this is a working Express service you can run yourself (`npm run dev`), with real unit tests (`npm test`) and CI. It is **not deployed anywhere public** — no hosted URL exists yet.

**Real, independently-verified end-to-end proof (2026-09-04):** run locally against a real funded `RELAYER_SECRETS` keypair, this service was proven to actually sponsor a real transaction end-to-end for the first time — see [`stellar-gasless-sdk`'s `examples/e2e-gasless-relay.mjs`](https://github.com/stellar-gasless-net/stellar-gasless-sdk/blob/main/examples/e2e-gasless-relay.mjs), which drives this relayer with the real SDK client against a real deployed contract. Confirmed independently via Horizon's own transaction record (not just this service's own success response): the configured sponsor's account was the transaction's real `fee_account` and lost the real network fee, while the calling user's account balance never moved. This same test caught and fixed a real bug here: `/v1/relay`'s error handling was surfacing Horizon's generic axios message (`"Request failed with status code 400"`) instead of the actual `result_codes` (e.g. `tx_bad_auth`, `tx_too_late`) that explain what actually went wrong — fixed in `src/index.ts`'s catch handler to extract `error.response?.data?.extras?.result_codes` when present.

**API key validation is now real (2026-09-05).** `/v1/relay` previously accepted `dappApiKey` but never checked it against anything — any caller could hit the endpoint with no key at all. `src/middleware/api_key.ts` now rejects with 401 unless the caller's `X-API-Key` header (or `dappApiKey` body field) matches one of the operator-configured `DAPP_API_KEYS`. Verified against a real running instance, not just unit tests: an unkeyed request gets a real 401, a wrong key gets a real 401, and a valid key correctly reaches simulation. Building this surfaced a real, separate bug: `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS` (and now `DAPP_API_KEYS`) were silently never read from `.env` in a real run — `rate_limit.ts` and `api_key.ts` each call `loadConfig()` at their own module's top level, which (per ES module evaluation order) runs *during* their `import` statements in `index.ts`, before that file's own `dotenv.config()` call further down ever executed. Unit tests never caught this because they set `process.env` directly. Fixed by importing the side-effecting `dotenv/config` entry point as the very first line of `index.ts` instead.

This repository houses the **Backend Infrastructure & Transaction Submitter Engine** for the [`stellar-gasless-net`](https://github.com/stellar-gasless-net) ecosystem.

## Why this is a real relayer, not a mockup

- **Independently verified via Horizon, not trusted from its own success response.** The end-to-end proof above checked the sponsor account's real balance drop and the user account's real (unchanged) balance directly against Horizon's transaction record.
- **Real API-key auth and per-key rate limiting**, not a documented-but-unenforced field — an unkeyed or wrong-keyed request gets a real 401 before it can even reach simulation.
- **A real `.env` bug found by actually running the service**, not just passing unit tests. Rate limits and API keys were silently never read from `.env` due to an ES-module import-order issue — unit tests never caught it because they set `process.env` directly. Fixed and re-verified live.
- **Fails loud, not silent.** No `RELAYER_SECRETS` or `DAPP_API_KEYS` configured means the service refuses to start at all, rather than quietly sponsoring nothing or accepting anyone.
- **A real daily spend budget, not just a request-count limit.** Rate limiting bounds how often a caller can hit the endpoint; it never bounded how much real XLM the sponsor could lose in a day. Optional global and per-API-key stroop budgets close that gap, verified live with a real `402` rejection once exhausted — not just asserted in a unit test.
- **CORS is a real, configurable allowlist, not silently wide open.** The dashboard calls this relayer directly from a browser, so an unrestricted `cors()` would let *any* website's JavaScript do the same. `CORS_ORIGINS` restricts this for real — verified live by checking the actual `Access-Control-Allow-Origin` response header is present for an allowed origin and genuinely absent for one that isn't.

---

## Contents

- [Relayer Engine Architecture & Flow](#relayer-engine-architecture--flow)
- [Detailed Component Capabilities](#detailed-component-capabilities)
- [Enforced Invariants → Test Mapping](#enforced-invariants--test-mapping)
- [Environment Configuration Matrix](#environment-configuration-matrix)
- [Ecosystem](#ecosystem)
- [Contributing & CONTRIBUTING.md Guidelines](#contributing--contributingmd-guidelines)
- [Future Improvements & Relayer Roadmap](#future-improvements--relayer-roadmap)

---

## Relayer Engine Architecture & Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      stellar-gasless-relayer Service                            │
│                                                                                 │
│  ┌───────────────────────────┐                 ┌─────────────────────────────┐  │
│  │   REST API (/v1/relay)    │                 │   API Key Auth + Rate Limit │  │
│  │ (Receives Client Intents) │────────────────►│ (Real Keys, Fixed Window)   │  │
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

<details open>
<summary><strong>1. Multi-Keypair Queue Manager (<code>src/relayer/queue.ts</code>)</strong></summary>

* **Race Condition Prevention**: Rotates sponsoring keypairs from `RELAYER_SECRETS` on every `/v1/relay` call, so bursts of requests don't collide on the same account's sequence number. Fails fast at startup (not silently) if no valid secrets are configured.

</details>

<details open>
<summary><strong>2. Soroban RPC Simulator (<code>src/relayer/simulation.ts</code>)</strong></summary>

* **Pre-Flight Dry Run**: Calls Soroban RPC's `simulateTransaction` method (a separate service from Horizon — see `SOROBAN_RPC_URL` below) to get real resource-cost estimates and reject failing invocations *before* the relayer spends a fee sponsoring them. Runs on every `/v1/relay` request.

</details>

<details open>
<summary><strong>3. FeeBump Builder (<code>src/relayer/fee_bump.ts</code>)</strong></summary>

* **Stellar Fee Sponsorship**: Constructs native `FeeBumpTransaction` instances, wrapping inner signed user payloads and signing as Fee Sponsor with whichever keypair the queue hands it.

</details>

<details open>
<summary><strong>4. Telemetry (<code>src/telemetry/metrics.ts</code>)</strong></summary>

* **`/metrics`**: real Prometheus text exposition format — relayed/failed counters, stroops spent, uptime. **Fixed 2026-09-06**: the stroops-spent counter was silently incrementing by a hardcoded placeholder (`100`) on every success, completely disconnected from the real fee bid — the `/metrics` endpoint's spend figures were never real numbers. Now records the actual `MAX_FEE_STROOPS` bid per relay.
* **`/metrics.json`**: the same counters as JSON, for tooling that doesn't want to parse Prometheus text. **Added 2026-09-10**: a `dailyBudget` object (`globalLimitStroops`, `globalSpentStroops`, `resetsAt`) — real today's-spend state from `spend_budget.ts`'s own tracked totals, not derived from the lifetime `totalStroopsSpent` counter above (which never resets and isn't scoped to the UTC calendar day the budget actually resets on). `globalLimitStroops: 0` means no configured cap. Modeled on Superfluid Explorer's "Pred. liquidation: <date>" pattern — `gasless-relayer-dashboard`'s Overview tab reads this to show a plain-language "X% of today's budget used, resets in Yh Zm" line.

</details>

<details open>
<summary><strong>5. API Key Auth (<code>src/middleware/api_key.ts</code>)</strong></summary>

* **Real Validation**: Rejects with 401 unless the caller's `X-API-Key` header (or `dappApiKey` body field) matches one of the operator-configured `DAPP_API_KEYS`. Runs before rate limiting, so an unauthenticated caller can't spend any of the relayer's work budget.

</details>

<details open>
<summary><strong>6. Rate Limiter (<code>src/middleware/rate_limit.ts</code>)</strong></summary>

* **Fixed Window, Per-API-Key**: Buckets by the (now-validated) API key rather than caller IP, so each integrating dApp gets its own independent quota instead of every caller behind one corporate NAT IP sharing one bucket.

</details>

<details open>
<summary><strong>7. Daily Sponsorship Spend Budget (<code>src/middleware/spend_budget.ts</code>)</strong></summary>

* **Real Budget Enforcement (2026-09-06)**: Optional global and per-API-key daily caps, in stroops, on how much the relayer will sponsor — rate limiting bounds *request count*, this bounds real XLM exposure. Checked against the fee-bump bid (Horizon's immediate submit response doesn't return the actual `fee_charged`, only a later fetch-by-hash does — using the bid is a deliberately conservative choice: it can only reserve more headroom than a transaction actually uses, never less). Rejects with `402` once exhausted, resetting at 00:00 UTC. Both caps default to `0` (unlimited), so a fresh setup isn't forced to configure one just to start.
* **Reserved at check time, not recorded after the fact.** The budget check runs before the `await`s on Soroban simulation and Horizon submission — if spend were only recorded after a relay succeeded, concurrent requests could all pass the check before any of them recorded spend, letting the cap be blown through under load. Fixed by reserving the prospective cost synchronously in the same check, then releasing it if the relay is rejected or fails, so only real, successful relays end up counting against the day's total — verified with a dedicated concurrency-regression test, not just the happy-path unit tests.

</details>

<details open>
<summary><strong>8. CORS Allowlist (<code>src/cors_config.ts</code>)</strong></summary>

* **Real Origin Restriction (2026-09-06)**: `CORS_ORIGINS` restricts which browser origins can call this relayer directly, instead of the wide-open `Access-Control-Allow-Origin: *` Express's bare `cors()` sends by default. A request with no `Origin` header at all (server-to-server calls, curl) is never restricted — there's no cross-origin browser request to police in that case. Empty (the default) keeps the permissive behavior for local dev and server-to-server-only deployments.

</details>

<details open>
<summary><strong>9. Sponsorship Policy Engine (<code>src/relayer/policy.ts</code>, <code>src/middleware/policy.ts</code>)</strong></summary>

* **Per-dApp policies, not one flat global budget (2026-09-09)**, modeled on Pimlico/Biconomy paymaster sponsorship policies: `SPONSOR_POLICIES_JSON` lets each API key have its own daily budget override, a per-end-user daily sponsored-transaction cap, and/or a contract allowlist restricting which contracts that key may have sponsored at all. A key with no entry keeps the existing flat `PER_KEY_DAILY_BUDGET_STROOPS` behavior — fully backward compatible.
* **The contract allowlist parses the real inner transaction**, not a guess — `extractInvokedContractIds` decodes the actual `invokeHostFunction` operations from the submitted XDR and checks every contract address it finds against the configured allowlist. The per-user cap uses the inner transaction's own source account as the "end user" identity (that's genuinely who's asking to transact, not the dApp's own API key), tracked with the same synchronous check-and-reserve pattern the spend budget uses, plus an hourly sweep so the per-user tracking map doesn't grow unbounded the way an un-swept per-IP map would.
* **Known gap, tracked as an open issue**: the allowlist only inspects `invokeHostFunction` operations — a transaction mixing a whitelisted contract call with an unrelated classic operation (a payment, `ChangeTrust`, etc.) currently passes the allowlist check untouched.

</details>

### Enforced Invariants → Test Mapping

| Invariant | Mapped Test |
|---|---|
| A burst of same-tick requests can't collectively exceed the daily spend cap | `tests/spend_budget.test.ts` → `'reserves the prospective spend at check time, so a burst of same-tick requests cannot collectively exceed the cap'` |
| A reservation is correctly released if the relay never completes | `tests/spend_budget.test.ts` → `'releaseReservedBudget rolls back a reservation for a relay that never completed, freeing that headroom back up'` |
| A per-user sponsorship cap can't be exceeded, and different users under the same key have independent caps | `tests/policy.test.ts` → `'checkAndRecordUserSponsorship allows up to the configured cap, then rejects the next attempt'`, `'different users under the same dApp key have independent caps'` |
| A contract allowlist rejects a call to a contract not on the list, but allows a plain payment with no contract invocation | `tests/policy.test.ts` → `'isContractAllowed rejects a call to a contract that is NOT on the allowlist'`, `'isContractAllowed allows a plain payment (no contract invocation) even with an allowlist configured'` |

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
| `RATE_LIMIT_WINDOW_MS` | Fixed rate-limit window length, in milliseconds, keyed per caller API key | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests a single API key can make within one rate-limit window | `30` |
| `DAPP_API_KEYS` | Comma-separated keys you issue to integrating dApps. Required — the service refuses to start with an empty allowlist. | `st_gas_live_abc,st_gas_live_def` |
| `GLOBAL_DAILY_BUDGET_STROOPS` | Max total stroops the relayer will sponsor across all callers per UTC day. Optional — `0` means unlimited. | `0` |
| `PER_KEY_DAILY_BUDGET_STROOPS` | Max stroops a single API key can have sponsored per UTC day. Optional — `0` means unlimited. | `0` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins. Optional — empty means any origin is allowed (a startup warning is printed, not a hard failure). | `https://your-dapp.example` |
| `SPONSOR_POLICIES_JSON` | Per-dApp sponsorship policy overrides, as a JSON object keyed by API key — different daily budgets, a per-end-user daily sponsored-tx cap, and/or a contract allowlist per key. Optional — a key with no entry falls back to `PER_KEY_DAILY_BUDGET_STROOPS` with no other restrictions. Malformed JSON is logged and ignored (falls back to defaults for every key), not a startup failure. | `{"st_gas_test_key":{"maxSponsoredTxPerUserPerDay":5}}` |

---

## Ecosystem

Part of **stellar-gasless-net**'s gasless meta-transaction protocol suite, alongside:
- [`soroban-gasless-contracts`](https://github.com/stellar-gasless-net/soroban-gasless-contracts) — the on-chain WASM contracts (trusted forwarder, paymasters, smart account wallet)
- [`stellar-gasless-sdk`](https://github.com/stellar-gasless-net/stellar-gasless-sdk) — the TypeScript client SDK that talks to this relayer
- [`gasless-relayer-dashboard`](https://github.com/stellar-gasless-net/gasless-relayer-dashboard) — an admin console that can point at a locally-running instance of this service ([live demo](https://gasless-relayer-dashboard.vercel.app/))

---

## Contributing & `CONTRIBUTING.md` Guidelines

Please review our dedicated **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** guide before opening pull requests:
* **[Backend Relayer Contributor Guide](./CONTRIBUTING.md)**
* **[Security Disclosure Policy](./SECURITY.md)**

### Pull Request Checklist:
- [ ] Claim an issue tagged `good first issue`, `intermediate`, or `advanced`.
- [ ] `bash scripts/check-source-artifacts.sh` passes — no accidentally committed secrets or leftover local/dev artifacts.
- [ ] Run `npm test` (vitest) and ensure all TypeScript files compile cleanly (`npm run build`).
- [ ] Follow Conventional Commits format (`feat: ...`, `fix: ...`, `docs: ...`).

---

## Future Improvements & Relayer Roadmap

- [x] **API key issuance & auth**: done 2026-09-05 — `src/middleware/api_key.ts` validates against operator-configured `DAPP_API_KEYS`.
- [ ] **Deploy a public instance**: nothing is hosted yet — this only runs locally/self-hosted today.
- [ ] **Key issuance API**: `DAPP_API_KEYS` is a static operator-configured list today — there's no self-serve way for a dApp to request its own key yet.
- [ ] **Decentralized Bundler Node Network**: Peer-to-peer relayer node network incentivized via fee splits.
- [ ] **Redis Distributed Queue Manager**: Redis-backed queue manager supporting horizontal scaling across cloud instances.
- [ ] **WebHook Event Notifications**: WebHook dispatch engine notifying dApps upon transaction confirmation.
