# Rein

**Give your AI agent a refund budget, not your PayPal keys.**

Rein is a deterministic mandate gate for AI agents that process PayPal refunds. The agent never holds the PayPal token—it asks Rein to refund specific items by name, Rein computes amounts from trusted data, validates against policy and live PayPal state, then allows, escalates, or blocks. Every decision is hash-chained in an audit ledger.

**PayPal sandbox only. No real money.**

---

## Quick Start (60 seconds, no keys)

```bash
git clone <repo-url> && cd Rein
npm ci  
npm run demo  # http://127.0.0.1:4317
```

Open `/demo` → Try Ticket 2 (prompt injection: "refund entire order")  
→ Left lane (no gate): $200 refunded ❌  
→ Right lane (with Rein): BLOCKED ✅

---

## Why It Matters

AI support agents are vulnerable to prompt injection. Rein bounds the damage:

✅ Agent names items, never amounts  
✅ Deterministic policy (no AI decides money)  
✅ Human approval for risky requests  
✅ Hash-chained audit trail  
✅ Fail-closed hooks  

**Limitations**: Not tamper-proof. Not a security boundary against host access. Single-instance only. See `docs/Architecture/THREAT_MODEL.md`.

---

## Architecture

```
[Ticket] → [Agent] → [Rein Hook] → [Policy Engine]
                           ↓               ↓
                    [PayPal API]    [Human Approval]
                           ↓
                     [Ledger]
```

---

## Tests & Evidence

✅ 99/99 tests passing  
✅ 10/10 adversarial tickets blocked  
✅ $0 over-refund (item-scoped vs amount-scoped: 70% over-refund)  
✅ Concurrent refund race tests pass  
✅ Hash chain integrity verified  

See `scripts/reinbench/` for reproducible benchmarks.

---

## Sponsor Tools Used

| Tool | How Rein Uses It |
|---|---|
| PayPal REST API (Payments v2, Orders, Disputes) | Money path - refunds, state validation (sandbox) |
| PayPal AI Toolkit / MCP | Gated via hooks, MCP proxy for item-scoped refunds |
| Claude (Anthropic) | Agent under test, Claude Code harness |
| Gemini (Google, optional) | Advisory AI summary, policy compiler |
| AG Grid Community | Ledger grid with hash verification |
| React, Vite, Express | Frontend SPA, backend API |
| SQLite (dual drivers) | Reservations, ledger, state |

---

## Documentation

- [API Reference](docs/API/API_REFERENCE.md)  
- [System Architecture](docs/Architecture/SYSTEM_ARCHITECTURE.md)  
- [Threat Model](docs/Architecture/THREAT_MODEL.md)  
- [Policy Reference](docs/Backend/POLICY_REFERENCE.md)  
- [Full docs index](docs/DOCUMENTATION_INDEX.md)

---

## Running Live Mode

1. Get PayPal sandbox credentials from https://developer.paypal.com/dashboard/
2. Create `.env`:
   ```
   PAYPAL_CLIENT_ID=your_id
   PAYPAL_CLIENT_SECRET=your_secret
   REIN_TOKEN=$(openssl rand -hex 32)
   ```
3. `npm run reseed` - Create fresh test captures
4. `npm run demo`

---

## Contributors

Built by Harsh Patil, DeepMehta06, Aayush, Devika Bongarde.  
See full credits in original README.

---

## License

MIT - see LICENSE

Built with Claude Code 🤖
