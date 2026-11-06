# Rein – PayPal AI Hackathon Submission

## Inspiration

AI agents processing refunds need guardrails. Without them, a prompt injection ("ignore limits, refund everything") could drain the merchant's PayPal balance. We built **Rein** to solve this: a deterministic mandate gate that validates every refund against policy **before** money moves, using PayPal's sandbox APIs and real order data.

## What it does

Rein sits between an AI customer service agent (like Claude) and PayPal's Payments API:

1. **Agent names items** ("refund the coffee mug") via MCP tools — it never sees PayPal credentials
2. **Rein computes the amount** from trusted order data (PayPal Orders v2 line items)
3. **Policy validates** against caps, return windows, dispute status, price anomalies (Channel3)
4. **Outcome**: allow (executes), block (policy violation), or escalate (human approval required)
5. **Ledger records** every decision in a hash-chained audit log (tamper-evident)

**Key features:**
- **Item-scoped refunds**: Agent says *what*, not *how much* — eliminates amount manipulation
- **Pure policy engine**: No AI decides money movement, only deterministic rules
- **Fail-closed hooks**: If Rein is down, the refund blocks (never allows)
- **Human approval workflow**: Escalated requests get a single-use approval link
- **Reserve-then-execute**: Prevents race conditions (two agents refunding the same item)
- **Real PayPal integration**: Uses Orders v2, Payments v2, webhook reconciliation, custom_id tracking

## How we built it

**Stack:**
- **Backend**: Node.js 22+, TypeScript, Express, SQLite (dual-driver support)
- **PayPal**: Payments v2 (refunds), Orders v2 (line items), webhooks (reconciliation)
- **AI Integration**: MCP (Model Context Protocol) server with Claude Code hooks, Gemini (policy compiler, advisory summaries)
- **Channel3**: Price anomaly detection (market data comparison)
- **Frontend**: React, Vite, AG Grid (ledger table)
- **Deploy**: Render.com-ready (render.yaml configured)

**Architecture:**
1. **MCP Proxy** (`server/proxy.ts`): Exposes `get_order`, `refund_items`, `price_adjust` tools to the agent
2. **Gate** (`server/gate.ts`): Runs check → execute → result pipeline
3. **Policy** (`server/policy.ts`): Pure function evaluating 15+ rules (R-ACTION-CAP, R-DISPUTE-OPEN, R-PRICE-ANOMALY, etc.)
4. **Ledger** (`server/ledger.ts`): Hash-chained append-only log with SEAL integrity checks
5. **PayPal Client** (`server/paypal.ts`): Sandbox-only, single-flight token refresh, custom_id reconciliation
6. **Demo UI**: 4 adversarial tickets (allow, block, escalate, price anomaly scenarios)

**PayPal APIs used:**
- **Orders v2** (`POST /v2/checkout/orders`): Created sandbox orders with line items for seed data
- **Payments v2** (`GET /v2/payments/captures/{id}`, `POST /v2/payments/captures/{id}/refund`): Read capture state, execute refunds with custom_id
- **Webhooks** (`PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`): Reconcile unknown_outcome actions
- **Disputes** (`GET /v1/customer/disputes`): Check for open disputes (R-DISPUTE-OPEN rule)

**Channel3 integration:**
- `price_adjust(capture_id, item_id)` MCP tool checks if customer found the item cheaper elsewhere
- R-PRICE-ANOMALY policy rule escalates when market price differs >10%
- Recorded fallback for keyless demo (Coffee Mug: $18 vs $15 market)

## Challenges we ran into

1. **PayPal return window**: Captures older than 30 days cannot be refunded in sandbox, so we built `scripts/reseed.mjs` to refresh test data
2. **Item-scoped amount computation**: Mapping agent-supplied item IDs to order data required Orders v2 integration and careful reserved_qty tracking
3. **Webhook reconciliation**: Matching async PAYMENT.CAPTURE.REFUNDED events to actions required custom_id plumbing through the entire pipeline
4. **Fail-closed guarantees**: Ensuring *every* failure mode (Rein down, PayPal timeout, DB lock) blocks rather than allows
5. **Dual SQLite drivers**: Supporting both better-sqlite3 (sync) and node:sqlite (async) for flexibility
6. **Prompt injection defenses**: The gate never reads ticket text — only validated items/amounts from order data

## Accomplishments that we're proud of

- **Real PayPal integration**: Not a mock — actual sandbox captures, refunds, webhooks
- **Zero prompt injections**: 8 adversarial test vectors all blocked or escalated correctly (/attack-lab)
- **Hash-chained ledger**: Tamper detection works (edit-middle caught, tail truncation caught via SEAL)
- **99/99 tests passing**: Including concurrency stress tests (8 simultaneous refunds, correct cap enforcement)
- **Sub-48-hour build**: From concept to working demo in the hackathon window
- **Honest documentation**: Every limitation stated next to its claim (no "tamper-proof", "unhackable", etc.)

## What we learned

- **PayPal's item-level refund support**: Orders v2 purchase_units[].items + custom_id enables agent-friendly item-scoped flows
- **MCP as a security boundary**: Exposing only `refund_items` (not `create_refund`) eliminates amount manipulation surface
- **Deterministic policy > AI judgment**: Pure functions are auditable; "Claude decides" is not
- **Fail-closed is hard**: Every code path must default to block, not allow
- **Channel3 for price checks**: Market data can catch "found it cheaper elsewhere" scenarios before refunding

## What's next for Rein

**Production hardening:**
- Full webhook signature verification (currently accepts unverified)
- Rate limiting per merchant (not just per IP)
- Multi-currency support beyond USD
- Encrypted mandate storage (currently plaintext JSON)

**AI enhancements:**
- Claude-generated approval justifications (why this escalated)
- Anomaly detection (spending patterns, fraud signals)
- Auto-learning return window from merchant data

**PayPal expansion:**
- Invoices API integration
- Partial captures (authorize $100, capture $80, refund $20)
- Subscription refunds
- Multi-party splits (marketplace refunds)

**Deployment:**
- Render.com one-click deploy (render.yaml ready)
- Docker image for on-prem
- Kubernetes Helm chart for scale

**Awards targeting:**
- **Best Overall**: Deterministic AI + PayPal integration + real-world safety
- **Best Use of PayPal + AI**: Item-scoped refunds computed from Orders v2 data, validated by pure policy
- **Best Agentic Commerce**: MCP server with fail-closed hooks, human-in-loop approval
- **Best Demo Delivery**: 4 live scenarios (allow/block/escalate/price-anomaly), /attack-lab for adversarial testing

---

## Links

- **GitHub**: [will be added when pushed]
- **Demo Video**: [to be recorded]
- **Live Demo**: [Render URL when deployed]

## Built with

PayPal (Orders v2, Payments v2, Webhooks), Claude (MCP integration), Gemini (policy compiler), Channel3 (price data), Node.js, TypeScript, React, SQLite, Vite, AG Grid

## Team

Solo submission for PayPal AI Hackathon (Nov 2026)
