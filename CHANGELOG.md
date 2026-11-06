# Changelog

## 0.1.0 (PayPal AI Hackathon - Nov 2026)

### Leash → Rein Transformation
- Global rename with LEASH_* → REIN_* env vars (backwards-compatible fallbacks)
- Mandate expiry extended to 2027-03-31 (105+ days past judging)
- Per-row mode tracking (sim/live) in ledger
- Mandate expiry validation in doctor script

### PayPal Integration Upgrades
- **Orders v2**: Real line items in captures (seed.mjs creates orders with purchase_units[].items)
- **custom_id reconciliation**: Action IDs tracked through refund → webhook → ledger
- **Webhook receiver**: POST /v1/webhooks/paypal handles PAYMENT.CAPTURE.REFUNDED, CUSTOMER.DISPUTE.CREATED
- **GET /v1/order/:captureId**: Resolve capture → order → items for dynamic lookups
- **OpenAPI 3.1 spec**: Full API documentation at docs/api/openapi.yaml

### Channel3 Integration
- **price_adjust MCP tool**: Check if customer found item cheaper elsewhere (market data)
- **R-PRICE-ANOMALY rule**: Escalates when market price differs >10%
- Demo ticket 4: "Found it cheaper elsewhere" scenario
- Recorded fallback for keyless demo (Coffee Mug: $18 vs $15 = 16.7% anomaly)

### AI Features
- **/attack-lab**: 8 Claude-generated adversarial test vectors (prompt injection, social engineering, etc.)
- **/ops dashboard**: Real-time metrics (daily cap usage, chain health, prevented loss)
- **/ledger upgrades**: Master-detail rows, grouping (by event/rule), CSV export

### Documentation
- Concise judge-focused README (quick start, why it matters, architecture, tests)
- DEVPOST_SUBMISSION.md for hackathon judges
- APIMatic.md documenting non-usage (manual OpenAPI authoring was faster)
- Updated CHANGELOG with full transformation history

### Testing
- 99/99 tests passing (1 known node:sqlite contention edge case)
- Typecheck clean across server, tests, web
- Web build: 1.4MB bundle with AG Grid, Vite optimization

### Prior (original Leash)
- Phase 1: TypeScript core (db, policy, dispatch, ledger, seal), PayPal-state rules, item-scoped refunds, shadow mode
- Phase 2: PayPal sandbox client, gate pipeline, MCP proxy, HTTP API, Claude Code hooks, doctor
- Phase 3: React UI (/demo, /approve, /ledger, /mandate); Lighthouse 100
- Phase 4: AI summary, rate limit, port auto-pick, render.yaml
- Phase 5: Architecture, security, contributing docs
