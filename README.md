# ⚡ Stellar Gasless Network (`stellar-gasless-net`)

[![Stellar](https://img.shields.io/badge/Stellar-Testnet-14B8A6?style=for-the-badge&logo=stellar&logoColor=white)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-v21.2.0-7C3AED?style=for-the-badge&logo=rust&logoColor=white)](https://soroban.stellar.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](./soroban-gasless-contracts/CONTRIBUTING.md)

**Stellar Gasless Network** is a high-throughput, enterprise-grade Gasless Meta-Transaction & Fee Delegation Protocol built natively for Stellar and Soroban WASM smart contracts. It empowers dApp developers to offer **100% zero-gas, 1-click user onboarding experiences** using WebAuthn Passkeys (TouchID/FaceID), native `FeeBumpTransaction` relayers, and dynamic Paymaster gas vaults.

---

## 🎯 Problem Statement & Technical Solution

### ❌ The Friction in Traditional Blockchain Onboarding
On traditional networks, a user must purchase and hold native gas tokens (e.g. XLM) in a crypto wallet before they can interact with any dApp. If a user has 0 XLM balance, they cannot transfer tokens, mint NFTs, or execute smart contracts—creating a **90%+ drop-off rate** for Web2 users.

### ✅ How Stellar Gasless Network Solves It
Our protocol leverages **Stellar Native Fee-Bump Transactions (`FeeBumpTransaction`)** and **Soroban Authorization Entries (`SorobanAuthorizationEntry`)** to decouple transaction signing from fee payment:

1. **Zero-Gas User Intent**: The user signs a cryptographic intent off-chain using browser TouchID/FaceID (WebAuthn Passkeys) without holding any XLM.
2. **Relayer Sponsorship**: The backend Relayer engine wraps the user's intent inside a `FeeBumpTransaction`, signs as the Fee Sponsor, and pays the 0.0001 XLM gas fee from its keypair pool.
3. **Paymaster Fee Deduction**: On-chain Paymaster WASM contracts deduct fees in custom SAC tokens (e.g., USDC) or promotional vouchers, reimbursing the Relayer treasury.

---

## 🏛️ System Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT FRONTEND LAYER                                 │
│  ┌───────────────────────────┐                      ┌────────────────────────────────┐  │
│  │   Browser WebAuthn API    │                      │     @stellar-gasless/sdk       │  │
│  │ (TouchID / FaceID Passkey)│                      │ (GaslessClient & Wallet Adapters)│  │
│  └─────────────┬─────────────┘                      └───────────────┬────────────────┘  │
└────────────────┼────────────────────────────────────────────────────┼───────────────────┘
                 │ (1) Sign Off-Chain Auth Entry (0 XLM Spent)        │
                 └─────────────────────────┬──────────────────────────┘
                                           │ (2) POST /v1/relay
                                           v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  BACKEND RELAYER LAYER                                  │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                      stellar-gasless-relayer Service                              │  │
│  │  - Multi-Keypair Queue Pool (Rotates Account Keys to Prevent Sequence Collisions)  │  │
│  │  - Soroban RPC Pre-flight Simulator (Validates payloads before broadcasting)      │  │
│  │  - FeeBumpTransaction Builder (Wraps inner payload & signs as Fee Sponsor)       │  │
│  │  - Prometheus Telemetry Exporter (/metrics endpoint for monitoring & alert logs)  │  │
│  └───────────────────────────────────────┬───────────────────────────────────────────┘  │
└──────────────────────────────────────────┼──────────────────────────────────────────────┘
                                           │ (3) Broadcast FeeBump Tx over Horizon RPC
                                           v
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                ON-CHAIN SMART CONTRACT LAYER                            │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                      soroban-gasless-contracts WASM Suite                         │  │
│  │  - trusted-forwarder: EIP-712 Domain Separator, Nonce Bitmap Replay Guard         │  │
│  │  - token-paymaster: SAC USDC Dynamic Fee Swap & Discount Tier Settlement          │  │
│  │  - voucher-paymaster: Single-use ECDSA Coupon & Merkle Inclusion Proofs           │  │
│  │  - account-abstraction-wallet: Native secp256r1 Passkey Smart Accounts            │  │
│  └───────────────────────────────────────┬───────────────────────────────────────────┘  │
└──────────────────────────────────────────┼──────────────────────────────────────────────┘
                                           │ (4) Ledger Confirmation
                                           v
                               ┌───────────────────────┐
                               │ Stellar Ledger Block  │
                               └───────────────────────┘
```

---

## ⚡ Core Protocol Features & Innovations

### 1. 📜 Soroban WASM Trusted Forwarder (`trusted-forwarder`)
* **EIP-712 Domain Separator**: Protects signatures against cross-chain and cross-contract replay attacks (`SorobanDomainSeparator`).
* **Nonce Bitmap Tracking**: Prevents transaction reordering and replay attacks via sequence nonce bitmaps.
* **Atomic Batch Execution**: Allows bundling multiple smart contract calls (`execute_batch`) into a single atomic transaction.

### 2. 💳 SAC Token Paymaster & Promotional Vouchers (`token-paymaster`, `voucher-paymaster`)
* **Auto USDC Fee Swap**: Deducts gas fees directly from the user's USDC balance using Stellar Asset Contracts (SAC), auto-converting to XLM.
* **Merkle Proof Vouchers**: Verifies cryptographic promotional coupons off-chain, granting targeted users 100% free transactions funded by dApp marketing budgets.

### 3. 🔑 Passkey Smart Accounts (`account-abstraction-wallet`)
* **Native `secp256r1` Curve Verification**: Validates browser WebAuthn Passkeys natively inside Soroban WASM without third-party wallet extensions.
* **Delegated Session Keys**: Issuance of temporary session keys with custom spending limits and expiration deadlines.

### 4. 🔄 Multi-Keypair Queue Rotation Engine (`stellar-gasless-relayer`)
* **Race Condition Protection**: Rotates a pool of sponsoring keypairs (`GCRELAY_POOL_KEY_1`, `GCRELAY_POOL_KEY_2`) to prevent sequence number collisions during transaction bursts.
* **Soroban RPC Pre-flight Simulation**: Dry-runs transactions against Horizon RPC (`https://horizon-testnet.stellar.org`) to reject failing calls before paying network fees.

### 5. 🖥️ Protocol Console & Developer Portal (`gasless-relayer-dashboard`)
* **Interactive Relay Simulator**: Live 3-step execution pipeline connected directly to Stellar Testnet Horizon RPC.
* **API Key Gateway**: Create, restrict, and set rate-limit boundaries for dApp API keys.
* **Live Code Snippet Generator**: Generates copy-paste TypeScript SDK code pre-populated with active production API keys.

---

## 💻 Integration & Usage Code Examples

### Example 1: Initialize Client SDK & Submit Meta-Transaction
```typescript
import { GaslessClient } from '@stellar-gasless/sdk';

// 1. Initialize Gasless Client
const client = new GaslessClient({
  relayerUrl: 'https://relayer.stellar-gasless.net',
  dappApiKey: 'st_gas_live_e92a84b19f2a',
});

// 2. Submit signed Soroban authorization payload
const result = await client.submitGaslessTransaction({
  userAddress: 'GBUSER_WALLET_ADDRESS_HERE',
  targetContract: 'CCFORWARDER_TRUSTED_CONTRACT_ID',
  payloadXdr: 'AAAAAgAAAA...',
});

console.log('⚡ Gasless Transaction Hash:', result.hash);
```

### Example 2: Request WebAuthn Passkey Biometric Signature
```typescript
import { PasskeyAdapter } from '@stellar-gasless/sdk';

// Request TouchID / FaceID signature off-chain (0 XLM spent by user)
const credential = await PasskeyAdapter.signChallenge(challengeHex);
console.log('Biometric Passkey Credential ID:', credential.id);
```

### Example 3: Use React Hook for 1-Line dApp Execution
```tsx
import { useGaslessTransaction } from '@stellar-gasless/sdk/react';

function GaslessMintButton() {
  const { executeGaslessTx, loading, txHash } = useGaslessTransaction();

  const handleMint = async () => {
    await executeGaslessTx({
      contractId: 'CCFORWARDER_TRUSTED_CONTRACT_ID',
      method: 'mint_nft',
      params: [],
    });
  };

  return (
    <button onClick={handleMint} disabled={loading}>
      {loading ? 'Sponsoring Gas...' : '⚡ Mint NFT (0 XLM Gas)'}
    </button>
  );
}
```

---

## 🏛️ Comprehensive Repository Suite

| Repository | Tech Stack | Primary Responsibilities | Governance Guide |
| :--- | :--- | :--- | :--- |
| 📜 **[`soroban-gasless-contracts`](./soroban-gasless-contracts)** | Rust, Soroban SDK v21 | WASM Smart Contracts: `trusted-forwarder`, `token-paymaster`, `voucher-paymaster`, `account-abstraction-wallet`. | 📖 [Contracts Guide](./soroban-gasless-contracts/CONTRIBUTING.md) |
| ⚡ **[`stellar-gasless-relayer`](./stellar-gasless-relayer)** | TypeScript, Node.js, Express | Backend Relayer Engine: Multi-keypair queue pool, Horizon RPC simulation, FeeBump builder, Prometheus telemetry. | 📖 [Relayer Guide](./stellar-gasless-relayer/CONTRIBUTING.md) |
| 📦 **[`stellar-gasless-sdk`](./stellar-gasless-sdk)** | TypeScript, WebAuthn, React | Client Library & Wallet Adapters: `GaslessClient`, WebAuthn Passkey biometric signer, Freighter / xBull adapters. | 📖 [SDK Guide](./stellar-gasless-sdk/CONTRIBUTING.md) |
| 🖥️ **[`gasless-relayer-dashboard`](./gasless-relayer-dashboard)** | Vanilla JS, HTML5, CSS3 | Protocol Console: Paymaster XLM deposits, dApp API key portal, live Horizon RPC broadcast simulator. | 📖 [Console Guide](./gasless-relayer-dashboard/CONTRIBUTING.md) |

---

## 🤝 Open-Source Governance & Contributing

We welcome contributions from developer community members, security researchers, and Stellar ecosystem builders!

Before contributing code or opening pull requests, please review our contributor guidelines:
* 📜 **[Smart Contracts Contributor Guide](./soroban-gasless-contracts/CONTRIBUTING.md)**
* ⚡ **[Backend Relayer Contributor Guide](./stellar-gasless-relayer/CONTRIBUTING.md)**
* 📦 **[Client SDK Contributor Guide](./stellar-gasless-sdk/CONTRIBUTING.md)**
* 🖥️ **[Protocol Console Contributor Guide](./gasless-relayer-dashboard/CONTRIBUTING.md)**

### 📌 Pull Request Workflow Rules
1. **Claim an Issue**: Browse open issues tagged `good first issue`, `intermediate`, or `advanced`.
2. **Local Test Verification**: Ensure all local test suites pass 100% cleanly before submitting:
   * Contracts: `cargo test --all`
   * Relayer & SDK: `npm test` && `npm run build`
3. **Conventional Commits**: Use standardized git commit messages (`feat: ...`, `fix: ...`, `docs: ...`).

---

## 🔮 Protocol Roadmap & Future Upgrades

```
  ┌──────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
  │  Phase 1 (Current)   │ ────► │   Phase 2 (Q4 2026)  │ ────► │   Phase 3 (2027)     │
  │ Core Contracts, SDK, │       │ Dynamic Gas Oracle,  │       │ Mainnet Bundler Pool,│
  │ Console, Relayer.    │       │ Multi-Sig Governance.│       │ Mobile SDK Adapters. │
  └──────────────────────┘       └──────────────────────┘       └──────────────────────┘
```

### 📅 Phase 1 (Completed & Audited)
- [x] High-performance Soroban WASM Forwarder & SAC Token Paymaster contracts (`cargo test` verified).
- [x] Multi-keypair account queue rotation in Relayer engine.
- [x] WebAuthn Passkey TouchID/FaceID biometric signer adapter.
- [x] Interactive Protocol Console with live Horizon RPC broadcast & SDK code generator.

### 📅 Phase 2 (Upcoming Quarter Upgrades)
- [ ] **Soroban Dynamic Gas Estimator Oracle**: Real-time gas price metering algorithm auto-adjusting fee caps based on Stellar ledger congestion.
- [ ] **Multi-Sig Paymaster Governance Vaults**: Multi-signature approval thresholds for depositing and withdrawing XLM gas reserves.
- [ ] **React Native & Flutter Adapters**: Mobile SDK adapters supporting mobile WebAuthn passkey enclaves.

### 📅 Phase 3 (Ecosystem Scaling & Mainnet Expansion)
- [ ] **Decentralized Bundler Node Network**: Peer-to-peer relayer node network incentivized via fee splits.
- [ ] **Soroban Mainnet Deployment**: Mainnet release with audited security proof verification.

---

## 📄 Security Policy & License

* **Security Vulnerability Reporting**: See [`SECURITY.md`](./soroban-gasless-contracts/SECURITY.md) for responsible disclosure guidelines.
* **License**: All repositories under **Stellar Gasless Network** are licensed under the **MIT License**. See [`LICENSE`](./LICENSE) for full details.
