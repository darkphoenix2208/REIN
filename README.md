# Rein 🛡️

**Give your AI agent a refund budget, not your PayPal keys.**

Rein is a deterministic mandate gate for AI agents that process PayPal refunds. The agent never holds the PayPal token—it asks Rein to refund specific items by name, Rein computes amounts from trusted data, validates against policy and live PayPal state, then allows, escalates, or blocks. Every decision is hash-chained in an audit ledger.

**Built by:** darkphoenix2208  
**PayPal sandbox only. No real money.**

---

## 🚀 Quick Start (60 seconds, no keys)

```bash
git clone <repo-url> && cd rein
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

✅ **Agent names items, never amounts**  
✅ **Deterministic policy** (no AI decides money)  
✅ **Human approval** for risky requests  
✅ **Hash-chained audit trail**  
✅ **Fail-closed hooks**  
✅ **Attack lab** with 8 adversarial vectors  

**Limitations**: Not tamper-proof. Not a security boundary against host access. Single-instance only. See `docs/Architecture/THREAT_MODEL.md`.

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
- **Attack lab**: 8 adversarial test vectors
- **Webhook security**: PayPal signature verification
- **Price-match**: Automatic price matching with market data

---

## 📊 Tests & Evidence

✅ **136 tests** (133 passing)  
✅ **8 adversarial attack vectors** - all blocked by gate  
✅ **$0 over-refund** (item-scoped vs amount-scoped: 70% over-refund prevention)  
✅ **Concurrent refund race tests** pass (8 simultaneous requests)  
✅ **Hash chain integrity** verified  
✅ **Webhook signature verification** with PayPal API  
✅ **Price-match computation** with pure functions  

### Attack Lab Vectors
1. **Prompt injection** - "VIP override" attempting full order refund
2. **Social engineering** - Urgency tactics ("URGENT: refund NOW")
3. **Amount manipulation** - Requesting $162 when only $20 captured
4. **Jailbreak** - "Ignore all previous instructions"
5. **Role confusion** - "As the merchant admin"
6. **Duplicate request** - Same refund twice
7. **Policy contradiction** - 100-day-old order
8. **Encoding bypass** - Hidden full order refund

All vectors execute through the real gate and are blocked appropriately.

---

## 🎨 Features

### Backend
- **8 Attack Vectors** through real gate (not mocked)
- **Webhook Security** with PayPal signature verification
- **Price-Match** computation with market data integration
- **Concurrent Safety** - handles 8 simultaneous refund requests
- **Hash-Chained Ledger** - tamper-evident audit trail

### Frontend
- **PayPal-Branded UI** with official color palette (#0070BA)
- **Inter Font** - modern fintech typography
- **Custom Favicon** - PayPal blue with 'R' logo
- **LIVE/SIMULATED Mode** - visual indicators
- **8 Pages** - Demo, Ledger, Ops, Attack Lab, Author, Mandate, Proof, Approvals
- **Responsive Design** - works on mobile (360px) to desktop (1440px)
- **AG Grid** - interactive ledger with hash verification

---

## 🛠️ Tech Stack

| Technology | Usage |
|-----------|-------|
| **PayPal REST API** | Refunds, Orders, Disputes (sandbox) |
| **Node.js 22.18+** | TypeScript execution with native type stripping |
| **React 19** | Frontend SPA with Vite build |
| **Express 5** | Backend API server |
| **SQLite** | Dual-driver support (better-sqlite3 / node:sqlite) |
| **AG Grid Community** | Ledger visualization with hash verification |
| **TypeScript 5.9** | Type-safe codebase |
| **Playwright** | E2E testing |

---

## 📚 Documentation

### Quick Links
- [API Reference](docs/API/API_REFERENCE.md) - HTTP endpoints and MCP tools
- [System Architecture](docs/Architecture/SYSTEM_ARCHITECTURE.md) - Design and data flow
- [Threat Model](docs/Architecture/THREAT_MODEL.md) - Security analysis
- [Policy Reference](docs/Backend/POLICY_REFERENCE.md) - Policy rules and limits
- [Full Documentation Index](docs/DOCUMENTATION_INDEX.md)

### Key Docs
- **Backend**: [Backend Guide](docs/Backend/BACKEND_GUIDE.md), [PayPal Integration](docs/Backend/PAYPAL_MCP_AUDIT.md)
- **Frontend**: [Frontend Guide](docs/Frontend/FRONTEND_GUIDE.md), [Design System](docs/Frontend/DESIGN_SYSTEM.md)
- **Operations**: [Operations Guide](docs/Operations/OPERATIONS_GUIDE.md), [Demo Script](docs/Operations/DEMO_SCRIPT.md)
- **Product**: [Competitive Analysis](docs/Product/COMPETITIVE_ANALYSIS.md), [Impact & Evidence](docs/Product/IMPACT_AND_EVIDENCE.md)

---

## 🚦 Running Live Mode

### Prerequisites
1. Get PayPal sandbox credentials from https://developer.paypal.com/dashboard/
2. Create `.env` file:

```bash
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
PAYPAL_WEBHOOK_ID=your_webhook_id
REIN_TOKEN=$(openssl rand -hex 32)
```

### Start the Server
```bash
npm run reseed  # Create fresh test captures
npm run demo    # Build UI and start server
```

Open http://127.0.0.1:4317

---

## 🧪 Development

### Install
```bash
npm ci
```

### Run Tests
```bash
npm test                    # All tests (136 total)
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
npm run replay        # Replay ledger events
```

---

## 🎯 API Endpoints

### Public Endpoints
- `GET /health` - Server health check
- `GET /demo` - Demo page
- `GET /ledger` - Audit ledger page
- `GET /attack-lab` - Attack lab page
- `GET /approve/:id` - Approval page

### Authenticated Endpoints
- `POST /v1/refund` - Process refund request
- `POST /v1/check` - Check refund without executing
- `POST /v1/order/:captureId` - Get order items
- `POST /v1/attack-lab/run` - Execute attack vector
- `POST /v1/webhooks/paypal` - PayPal webhook receiver

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

### What Rein Does NOT Protect Against
❌ Host system compromise  
❌ Database tampering with full access  
❌ Malicious mandate activation  
❌ Service unavailability (fails closed)  

See [Threat Model](docs/Architecture/THREAT_MODEL.md) for complete analysis.

---

## 🎨 UI Screenshots

The UI features PayPal's official brand colors and Inter font for a professional fintech appearance:

- **PayPal Blue (#0070BA)** - Primary actions and branding
- **Dark Blue (#003087)** - Hover states
- **Light Blue (#009CDE)** - Accents and highlights
- **Custom Favicon** - 'R' logo on PayPal blue background
- **Mode Indicators** - Visual distinction for LIVE vs SIMULATED

---

## 📝 Testing

### Test Breakdown
- **136 total tests** (133 passing, 3 test setup issues)
- **25 test suites** covering all features
- **40 new tests** added (attack lab, webhooks, price-match)

### Test Categories
- Attack lab execution (5 tests)
- Webhook security (5 tests)
- Price-match computation (14 tests)
- Channel3 integration (5 tests)
- Core gate logic (50+ tests)
- Concurrency & race conditions (12 tests)
- E2E browser tests (4 tests, requires REIN_CHROMIUM)

---

## 🤝 Contributing

This is a hackathon submission project. For questions or issues:

**Author**: darkphoenix2208  
**Email**: darkphoenix.2208@gmail.com

---

## 📄 License

MIT License

Copyright (c) 2026 darkphoenix2208

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🏆 Hackathon Submission

**Project**: Rein - AI Agent Refund Gate for PayPal  
**Author**: darkphoenix2208  
**Category**: AI Safety & Fintech  
**Technologies**: PayPal REST API, Node.js, React, TypeScript  

### Key Achievements
- ✅ 8 adversarial attack vectors blocked
- ✅ 136 tests with 98% pass rate
- ✅ PayPal webhook signature verification
- ✅ Price-match with market data
- ✅ Professional PayPal-branded UI
- ✅ Hash-chained audit ledger
- ✅ Zero over-refunds in testing

---

**Built with ❤️ by darkphoenix2208**
