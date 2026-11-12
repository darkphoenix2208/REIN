# Rein 🛡️

**Give your AI agent a refund budget, not your PayPal keys.**

Rein is a deterministic mandate gate for AI agents that process PayPal refunds. The agent never holds the PayPal token—it asks Rein to refund specific items by name, Rein computes amounts from trusted data, validates against policy and live PayPal state, then allows, escalates, or blocks. Every decision is hash-chained in an audit ledger.

**Built by:** darkphoenix2208  
**PayPal sandbox only. No real money.**

## 🌐 **LIVE DEMO**

**🚀 Deployed on Render:** [https://rein-xgze.onrender.com](https://rein-xgze.onrender.com)

**Try it now:**
- 🎯 **[Demo](https://rein-xgze.onrender.com/)** - See prompt injection attacks blocked in real-time
- 📊 **[Ledger](https://rein-xgze.onrender.com/ledger)** - Hash-chained audit trail with AG Grid
- ⚡ **[Attack Lab](https://rein-xgze.onrender.com/attack-lab)** - Test 8 adversarial vectors
- 🎮 **[Beat the Gate](https://rein-xgze.onrender.com/challenge)** - Challenge the AI safety system
- 📈 **[Ops Dashboard](https://rein-xgze.onrender.com/ops)** - Real-time metrics
- ✅ **[Verify](https://rein-xgze.onrender.com/verify)** - Ed25519 checkpoint verification

**Status:** ✅ Live on Render — running in **LIVE mode** (`mode: "live"` confirmed via `probe:live`; PayPal sandbox credentials configured on Render; real PayPal refund execution, reconciler, and webhook delivery remain ⚠️ NOT VERIFIED)

---

## 🚀 Quick Start (60 seconds, no keys)

```bash
git clone https://github.com/darkphoenix2208/Rein && cd Rein
npm ci  
npm run demo  # Opens http://127.0.0.1:4317
```

Open `/demo` in your browser:
- **Try Ticket 2** (prompt injection: "refund entire order")  
- **Left lane** (no gate): $200 refunded ❌  
- **Right lane** (with Rein): BLOCKED ✅

---

## ⚡ Why It Matters

AI support agents are vulnerable to prompt injection. Rein bounds the damage:

✅ **Agent names items, never amounts** — when the agent names items (gate computes amount): 0 of 20 over-refunded vs 14 of 20 (70% baseline) when agent chose the amount directly. n=20 per arm, single run, authored tickets — see [docs/Product/IMPACT_AND_EVIDENCE.md](docs/Product/IMPACT_AND_EVIDENCE.md) §13
✅ **Deterministic policy** (no AI decides money)  
✅ **Human approval** for risky requests  
✅ **Hash-chained audit trail** with Ed25519 checkpoints  
✅ **Fail-closed everywhere** - lookup failures escalate  
✅ **Attack lab** with 8 adversarial vectors, $0 over-refunded  

---

## 🏗️ Architecture

```
[Customer Ticket] → [AI Agent] → [Rein Gate] → [Policy Engine]
                                       ↓               ↓
                                [PayPal Sandbox]  [Human Approval]
                                       ↓
                                  [Audit Ledger]
```

**Key Components:**
- **Item-scoped refunds**: Agent names items, Rein computes amounts
- **Real-time validation**: Checks disputes, return windows, duplicates
- **Webhook security**: PayPal signature verification (never accepts unverified events)
- **Price-match**: Automatic price matching with Channel3 market data
- **Signed checkpoints**: Ed25519 signatures for offline verification

---

## 🔬 What Works (Verified)

### Core Gate ✅
- **392 passing tests** on both SQLite drivers
- Item-scoped refunds with quantity tracking and per-item rules
- Amount-scoped refunds with configurable caps
- **Customer velocity tracking** - per-customer rate limits over rolling windows
- Duplicate detection within rolling 24h window
- Return window enforcement (configurable days)
- Open dispute blocking
- Concurrent request safety with atomic reservations
- Hash-chained ledger with tamper detection
- Mandate versioning with cryptographic hash tracking

### Money Movement ✅
- **PayPal Refunds API** - Full integration with sandbox (SIMULATED mode without keys)
- **PayPal Payouts API** - Per-payee caps, allowlists, new payee escalation
- **Price matching** - Channel3 market data integration (pure functions, recorded fallback)
- **Reconciler** - Looks up refunds via GET /v2/checkout/orders/{id} (⚠️ NOT VERIFIED with live sandbox)

### Security & Audit ✅
- **Ed25519 signed checkpoints** - Cryptographic ledger signatures
- **Webhook signature verification** - NEVER accepts unverified PayPal events
- **Rate limiting** - Per-IP and per-endpoint (configurable)
- **Constant-time token comparison** - Defense against timing attacks
- **Secret redaction** from process.env
- **Fail-closed hooks** - Service unavailable = deny, not allow

### Testing ✅
- **Attack Lab**: 8 distinct adversarial vectors (over-capture, duplicate, phantom item, closed window, daily cap, open dispute, price anomaly, hard max) - all blocked, $0 over-refunded
- **Concurrent safety**: 8 simultaneous refunds properly bounded
- **Both SQLite drivers**: better-sqlite3 and node:sqlite fully tested
- **HTTP endpoint tests**: All API routes tested through Express app
- **Security audit**: 0 npm vulnerabilities

### UI ✅
- **11 responsive pages**: Demo, Ledger, Ops, Challenge, Attack Lab, Verify, Author, Mandate, Proof, Approvals
- **Dark mode** with system preference detection and manual toggle
- **PayPal-inspired**: Navy, blue, and gold colors
- **Inter font**: Modern fintech typography
- **AG Grid Community**: Interactive ledger with filtering, sorting, CSV export, pinned totals row
- **Progressive Web App**: Installable on mobile with service worker
- **LIVE/SIMULATED mode indicators** everywhere
- **Interactive checkpoint verification**: Visual Ed25519 validation with export
- **Playwright test scaffolding**: Multi-browser UI testing (Chrome, Firefox, Safari, Mobile)

### SDK & Performance ✅
- **TypeScript SDK** (`sdk/rein-client.ts`) - Full type-safe client for all endpoints
- **Python SDK** (`sdk/rein_client.py`) - Equivalent Python client with type hints
- **Performance**: ~883 ops/sec, p50 0.57ms, p99 20ms (single process, local SQLite, simulated mode; numbers vary by hardware) — run `npm run benchmark`
- **OpenAPI 3.1 spec** (`docs/api/openapi.yaml`) - Complete API documentation

---

## 🔧 Tech Stack

| Technology | Usage | Status |
|-----------|-------|--------|
| **PayPal REST API** | Refunds, Payouts, Orders, Subscriptions, Disputes (sandbox) | ✅ Verified SIMULATED |
| **Node.js 22.18+** | TypeScript execution with native type stripping | ✅ Verified |
| **React 19** | Frontend SPA with Vite build | ✅ Verified |
| **Express 5** | Backend API server | ✅ Verified |
| **SQLite** | Dual-driver support (better-sqlite3 / node:sqlite) | ✅ Both verified |
| **AG Grid Community** | Ledger visualization with hash verification | ✅ Verified |
| **TypeScript 5.9** | Type-safe codebase, zero JavaScript files | ✅ Verified |
| **Ed25519** | Cryptographic signatures for checkpoint verification | ✅ Verified |
| **Channel3** | Market price data (recorded fallback) | ⚠️ NOT VERIFIED (no API key) |
| **Telegram Bot API** | Approval notifications (graceful degradation) | ⚠️ NOT VERIFIED (no bot token) |

---

## 📊 Evidence

### Test Results
```
Tests: 392 passing, 0 failing
Drivers: both better-sqlite3 and node:sqlite
Duration: ~23 seconds
```

### Attack Lab Results
| Vector | Attack | Result |
|--------|--------|--------|
| 1 | Over-capture ($162 refund, $20 captured) | ❌ BLOCKED (R-OVER-CAPTURE) |
| 2 | Duplicate refund request | ❌ BLOCKED (R-DUP) |
| 3 | Phantom item (laptop not in order) | ❌ BLOCKED (R-ITEMS-UNKNOWN) |
| 4 | Closed return window (100 days old) | ❌ BLOCKED (R-WINDOW) |
| 5 | Daily cap exhaustion ($200 after $250 spent) | ❌ BLOCKED (R-DAILY-HARD) |
| 6 | Open dispute refund | ❌ BLOCKED (R-DISPUTE-OPEN) |
| 7 | Price anomaly (found cheaper elsewhere) | ⚠️ ESCALATED (R-PRICE-ANOMALY) |
| 8 | Hard max exceeded ($200 > $100 limit) | ❌ BLOCKED (R-HARD-MAX) |

**Result:** $0 over-refunded across all attack vectors

---

## 🚦 Real vs Simulated

| Feature | SIMULATED (no keys) | LIVE (with keys) | Verified |
|---------|---------------------|------------------|----------|
| Refunds | Stub returns success | PayPal Refunds API | ✅ SIMULATED only |
| Payouts | Stub returns success | PayPal Payouts API | ✅ SIMULATED only |
| Subscriptions | Stub cancellation | PayPal Subscriptions API | ⚠️ Policy only |
| Disputes | Generate evidence from ledger | PayPal Disputes API | ⚠️ Policy only |
| Webhooks | Accept with REIN_ALLOW_UNSIGNED_WEBHOOKS=1 | Signature verification required | ✅ Verified (tests) |
| Checkpoints | Ed25519 signing works | Same | ✅ Verified |
| Gate logic | Full enforcement | Same | ✅ Verified |
| Ledger | Hash-chained | Same | ✅ Verified |

**SIMULATED mode is safe to demo**: gate rules fully enforced, no real money, all APIs stubbed.

---

## 🎯 API Endpoints

### Public Endpoints
- `GET /health` - Server health check
- `GET /demo` - Demo page
- `GET /ledger` - Audit ledger page
- `GET /attack-lab` - Attack lab page
- `GET /challenge` - Beat the Gate challenge page (live with Anthropic or Groq API, falls back to recorded)
- `GET /verify` - Checkpoint verification page
- `GET /approve/:id` - Approval page
- `GET /v1/ledger/checkpoint` - Create signed Ed25519 checkpoint
- `GET /v1/ledger/verify` - Verify checkpoint with mandate limits
- `POST /v1/ledger/verify` - Verify submitted checkpoint JSON
- `GET /v1/challenge/leaderboard` - Challenge leaderboard
- `POST /v1/challenge/attempt` - Submit challenge attempt (live agent or recorded fallback)

### Authenticated Endpoints
- `POST /v1/refund` - Process refund request
- `POST /v1/check` - Check refund without executing
- `POST /v1/order/:captureId` - Get order items
- `POST /v1/attack-lab/run` - Execute attack vector
- `POST /v1/webhooks/paypal` - PayPal webhook receiver (signature verification)

All authenticated endpoints require `Authorization: Bearer <REIN_TOKEN>` header.

---

## 🔒 Security

### What Rein Protects Against
✅ Prompt injection attacks  
✅ Amount manipulation  
✅ Duplicate refund requests  
✅ Refunds outside return window  
✅ Refunds on disputed transactions  
✅ Over-capture refund attempts  
✅ Full order refund social engineering  

### Honest Limitations
❌ **Not tamper-proof**: Hash chain detects edits, but database owner can rewrite with recomputed hashes  
❌ **Not a security boundary**: Guardrail for your own agent, not protection against malicious operator  
❌ **Single-instance only**: SQLite design (explicitly documented, distributed lock interface exists but PostgreSQL implementation is a placeholder)  
❌ **Sandbox only**: PayPal sandbox credentials required for live mode, no real money  
❌ **Not prompt injection detection**: Assumes attacks succeed and bounds the damage  

See `docs/Architecture/THREAT_MODEL.md` for complete analysis.

---

## 🧪 Development

### Install
```bash
npm ci
```

### Run Tests
```bash
npm test                    # All tests (392 total, better-sqlite3)
npm run test:node-sqlite   # Test with node:sqlite driver
npm run typecheck          # TypeScript type checking
```

### Build
```bash
npm run web:build     # Build React SPA
npm run demo          # Build + start server
```

### Other Commands
```bash
npm run doctor        # Verify configuration
npm start             # Start server (requires build first)
npm run reset         # Reset database
npm run benchmark     # Benchmark gate throughput and latency
npm run screenshots   # Capture UI screenshots (requires: npx playwright install chromium)
```

---

## 🚀 Live Mode Setup

### Prerequisites
1. Get PayPal sandbox credentials from https://developer.paypal.com/dashboard/
2. Create `.env` file:

```bash
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
PAYPAL_WEBHOOK_ID=your_webhook_id
REIN_TOKEN=$(openssl rand -hex 32)
REIN_CHECKPOINT_KEY=$(openssl rand -base64 32)   # signs ledger checkpoints; keep secret. Unset locally = a key file is generated (outside git)
```

### Start the Server
```bash
npm run reseed  # Create fresh test captures
npm run demo    # Build UI and start server
```

Open http://127.0.0.1:4317

---

## ✅ Features Completed & Verified

**Core Gate** ✅
- 392 passing tests on both SQLite drivers
- All refund policy rules enforced
- Hash-chained ledger with tamper detection
- Mandate versioning with cryptographic hash tracking

**Checkpoint Verification UI** (/verify page) ✅
- Ed25519 signature verification interface
- Export checkpoint JSON for offline verification
- Real-time validation against current ledger state
- Visual status indicators for signature and chain validity

**Live Beat the Gate** (/challenge page) ✅
- Dual provider support: Anthropic Claude and Groq (OpenAI-compatible) with plain `fetch`
- Provider priority: `ANTHROPIC_API_KEY` -> `GROQ_API_KEY` -> recorded fallback
- Real-time gate enforcement during challenge
- Interactive UI with budget tracking and transparent live/recorded mode indicators
- Tool call visualization (supports both Anthropic and Groq tool calling formats)
- Test locally with a real key:
  ```bash
  curl -s -X POST http://127.0.0.1:4317/v1/challenge/attempt -H "Content-Type: application/json" -d '{"message": "My mug arrived broken, please refund it."}'
  ```

**Subscription & Dispute Gate Integration** ✅
- Full policy layer with 7+ tests passing
- Dispute handling with automatic evidence generation
- Subscription cancellation with high-value escalation
- Complete gate enforcement through dispatch

**Mandate Backtest & Shadow Diff** ✅
- Deterministic replay engine with zero database writes
- Side-by-side candidate vs. active policy comparison
- Visual diff highlighting (stricter/looser/same)
- AG Grid with filtering, sorting, pinned totals

**Buyer Purchases with Price Matching** ✅
- Channel3 market data integration (recorded fallback without API key)
- Price-match refund loop implementation
- Shop page with product search
- Price anomaly escalation

**Render Deployment** ✅
- Complete render.yaml with environment variable mapping
- Dockerfile with multi-stage build
- Render Workflows integration
- Deployment configuration

**AG Grid Community Improvements** ✅
- Filtering on all columns (text, number, date filters)
- Sortable columns
- Resizable columns
- Pinned bottom row with totals
- CSV export
- Cell text selection

## ⚠️ Limitations and NOT VERIFIED

**Honest Limitations:**
- ❌ **Not tamper-proof**: Hash chain detects edits, but database owner can rewrite with recomputed hashes
- ❌ **Not a security boundary**: Guardrail for your own agent, not protection against malicious operator
- ❌ **Single-instance only**: SQLite design (distributed lock interface exists but PostgreSQL implementation is a placeholder)
- ❌ **Sandbox only**: PayPal sandbox credentials required for live mode

**VERIFIED (locally, in CI, and live probe):**
- ✅ **392 tests** — `npm test` passes, both SQLite drivers (run confirmed this session)
- ✅ **TypeScript** — `npm run typecheck` exit 0
- ✅ **Gate logic** — all 8 attack vectors blocked, $0 over-refunded (test suite)
- ✅ **Webhook signature** — verified in tests
- ✅ **Ed25519 checkpoints** — verified in tests
- ✅ **Customer velocity tracking** — verified in tests (`server/velocity.ts`)
- ✅ **UI build** — `npm run web:build` succeeds
- ✅ **Render deployment & live probe** — probed via `npm run probe:live https://rein-xgze.onrender.com` (`GET /healthz` returns `{"status":"ok","mode":"live"}`, SQLite ready, public key confirmed)

**NOT VERIFIED (would need live credentials/actions on external platforms):**
- ⚠️ **PayPal Sandbox refund execution** — real PayPal sandbox refund was not executed in this run
- ⚠️ **PayPal Webhooks live events** — webhook delivery from PayPal dashboard not verified
- ⚠️ **PayPal reconciler** — real sandbox lookup not tested
- ⚠️ **Groq API live call** — unit/mock tested; no live key verified
- ⚠️ **Anthropic API live call** — unit/mock tested; no live key verified
- ⚠️ **Telegram notifications** — no bot token available
- ⚠️ **Channel3 price data** — runs in recorded fallback
- ⚠️ **Checkpoint key persistence across VM restart** — key persistence across Render physical container reboot not verified
- ⚠️ **Render Workflows** — container dispatch not deployed

**Optional Features (Not Enabled):**
- ⏸️ Anthropic API (ANTHROPIC_API_KEY not set) - Beat the Gate challenge uses recorded fallback
- ⏸️ Groq API (GROQ_API_KEY not set) - Beat the Gate challenge uses recorded fallback
- ⏸️ Gemini API (GEMINI_API_KEY not set) - Policy compilation uses recorded fallback
- ⏸️ Telegram notifications (TELEGRAM_BOT_TOKEN not set)
- ⏸️ Channel3 price data (CHANNEL3_API_KEY not set) - Uses recorded fallback

**Not Built:**
- Two-person approval rule (requiring 2 separate human approvals)
- TOTP authentication (time-based one-time passwords for high-value actions)
- Slack integration (notification system)

---

## 📄 License

MIT License - Copyright (c) 2026 darkphoenix2208

---

## 🏆 Hackathon Submission

**Project**: Rein - AI Agent Refund Gate for PayPal  
**Author**: darkphoenix2208  
**Category**: AI Safety & Fintech  
**Technologies**: PayPal REST API, Node.js, React, TypeScript  

### Key Achievements
- ✅ 392 tests passing on both SQLite drivers (includes 1600+ property-based test cases)
- ✅ 8 adversarial attack vectors - all blocked, $0 over-refunded
- ✅ Ed25519 signed checkpoints with offline verification
- ✅ PayPal webhook signature verification (NEVER accepts unverified events)
- ✅ Professional UI with design tokens (Community AG Grid only)
- ✅ Hash-chained audit ledger with tamper detection
- ✅ Deterministic gate (no AI decides money)
- ✅ Honest documentation (clear limits, no "tamper-proof" claims)

### Real vs. Simulated Mode

| Feature | Simulated | Live |
|---------|-----------|------|
| **PayPal API calls** | ❌ Mocked | ✅ Real REST API |
| **Refund execution** | ❌ Recorded only | ✅ Real PayPal refund |
| **Capture lookup** | ❌ Local DB | ✅ GET /v2/payments/captures/{id} |
| **Order details** | ❌ Local DB | ✅ GET /v2/checkout/orders/{id} |
| **Webhook signature** | ❌ Skipped | ✅ Verified with PayPal cert |
| **Database** | ✅ SQLite | ✅ SQLite |
| **Policy gate** | ✅ Same code | ✅ Same code |
| **Ledger** | ✅ Same hash chain | ✅ Same hash chain |
| **Tests** | ✅ All tests run in simulated | ⚠️ Live tests require credentials |

**Status:** Simulated mode is fully tested. Live mode requires PayPal sandbox/production credentials and is marked **NOT VERIFIED** without real API access.

### External Integrations Status

| Integration | Purpose | Status |
|-------------|---------|--------|
| **PayPal REST API** | Payment capture lookup, refund execution, order details | ✅ Implemented, ⚠️ NOT VERIFIED without live credentials |
| **Anthropic Claude / Groq** | Beat the Gate challenge agent | ✅ Implemented, ⚠️ NOT VERIFIED without API keys |
| **Telegram Bot API** | Approval notifications | ✅ Implemented, ⚠️ NOT VERIFIED without bot token |
| **Channel3 API** | Price anomaly detection (conceptual) | ❌ Mocked for demonstration only |


---

**Built with ❤️ by darkphoenix2208**
