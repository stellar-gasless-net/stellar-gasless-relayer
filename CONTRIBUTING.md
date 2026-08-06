# Contributing to Stellar Gasless Relayer Service (`stellar-gasless-relayer`)

First off, thank you for helping build **`stellar-gasless-relayer`**! ⚡

This repository houses the high-performance **TypeScript Backend Relayer Engine** that wraps user-signed inner meta-transactions into native Stellar `FeeBumpTransaction` instances and broadcasts them to Horizon/RPC nodes.

---

## 📋 Table of Contents

1. [Ecosystem Context](#-ecosystem-context)
2. [Local Development Setup](#-local-development-setup)
3. [Repository Directory Map](#-repository-directory-map)
4. [Step-by-Step Contributor Workflow](#-step-by-step-contributor-workflow)
5. [Coding Standards & Middleware Rules](#-coding-standards--middleware-rules)
6. [Testing & Verification](#-testing--verification)
7. [Git Commit & Pull Request Guidelines](#-git-commit--pull-request-guidelines)

---

## 🏛️ Ecosystem Context

`stellar-gasless-relayer` operates between dApp frontends and Stellar Horizon/Soroban RPC:

```
[ Frontend (SDK) ] ──► [ stellar-gasless-relayer ] ──► [ Stellar Horizon RPC ]
```

- 📜 [**`soroban-gasless-contracts`**](https://github.com/stellar-gasless-net/soroban-gasless-contracts): On-chain Soroban WASM contracts.
- ⚡ **`stellar-gasless-relayer`** (This Repo): FeeBump engine, keypair pool queue, rate limiter & telemetry server.
- 📦 [**`stellar-gasless-sdk`**](https://github.com/stellar-gasless-net/stellar-gasless-sdk): TypeScript client library.
- 🖥️ [**`gasless-relayer-dashboard`**](https://github.com/stellar-gasless-net/gasless-relayer-dashboard): Admin portal & SPA UI.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js**: v20+ (`node -v`)
- **npm**: v10+ (`npm -v`)
- **Docker** (Optional, for containerized local testing)

### 2. Setup Procedure
```bash
# 1. Clone your fork
git clone https://github.com/YOUR-USERNAME/stellar-gasless-relayer.git
cd stellar-gasless-relayer

# 2. Install dependencies
npm install

# 3. Create environment configuration from template
cp .env.example .env

# 4. Start local development server (with hot reload)
npm run dev
```

The relayer API will start listening at `http://localhost:3001`.

---

## 📂 Repository Directory Map

```
src/
├── relayer/
│   ├── fee_bump.ts        # Stellar SDK FeeBumpTransaction builder
│   ├── queue.ts           # Multi-keypair account pool rotation queue
│   └── simulation.ts     # Soroban RPC pre-flight dry-run simulator
├── middleware/
│   ├── rate_limit.ts      # Sliding-window IP rate limiter & API Key validator
│   └── logger.ts          # Structured logger with StellarExpert link generator
├── telemetry/
│   └── metrics.ts         # Prometheus metrics collector (/metrics)
├── types/
│   └── index.ts           # TypeScript interfaces for API payloads
├── config.ts              # Zod environment variable validator
└── index.ts               # Express API Server entry point
```

---

## 🔄 Step-by-Step Contributor Workflow

### Step 1: Find an Issue
Check out open issues on [GitHub Issues](https://github.com/stellar-gasless-net/stellar-gasless-relayer/issues). Pick tasks tagged with:
- `good first issue`: API enhancements, log improvements, environment variables.
- `intermediate`: Relayer keypair pool queue, webhook callbacks, telemetry exporters.
- `advanced`: Multi-keypair sequence lock management, gas estimation algorithms, load testing.

### Step 2: Create a Feature Branch
```bash
git checkout -b feat/issue-15-keypair-rotation
```

### Step 3: Implement & Test
Test endpoints locally using cURL or Postman:
```bash
curl -X POST http://localhost:3001/v1/relay \
  -H "Content-Type: application/json" \
  -H "X-API-Key: st_gas_test_key" \
  -d '{"innerTransactionXdr": "AAAAAg..."}'
```

---

## 🧪 Testing & Verification

Run tests and ensure TypeScript compilation succeeds cleanly:

```bash
# 1. Run unit tests
npm test

# 2. Verify TypeScript build compilation
npm run build
```

---

## 📝 Git Commit & Pull Request Guidelines

We enforce **Conventional Commits**:
- `feat: implement multi-keypair sequence lock in queue manager`
- `fix: correct rate limiter window calculation`
- `test: add Jest mock tests for horizon submission failure`
- `docs: update OpenAPI specification table`

Thank you for contributing to **Stellar Gasless Relayer Service**! ⚡
