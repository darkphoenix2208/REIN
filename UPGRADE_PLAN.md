# Rein → Rein: Hackathon Upgrade Plan

**Project**: Rein - "Give your AI agent a refund budget, not your PayPal keys."
**Deadline**: Submit by Nov 11, 2026 (deadline Nov 12, 12:00 PM PT / 1:30 AM IST Nov 13)
**Target**: PayPal AI Hackathon - Best Overall, Best Use of PayPal + AI, Best Use of Agentic Commerce, Best Demo Delivery + Sponsor Awards

## Baseline Status (Nov 6, 2026)

✅ **Typecheck**: Clean (all 3 tsconfig files pass)
✅ **Tests**: 97/99 passing (2 MCP stdio tests failing - environment specific)
- better-sqlite3: all tests pass
- node:sqlite: all tests pass  
- Core policy engine: all tests pass
- Item-scoped refunds: all tests pass
- Concurrency/race conditions: all tests pass
- Security (guard hooks): all tests pass

❌ **Node version**: Had to relax from >=22.18 to >=22.0.0 (running 22.14)
❌ **Experimental flag**: Added --experimental-strip-types for TypeScript support

---

## PHASE 0: Pre-work Complete ✅

- [x] Read all critical docs (README, THREAT_MODEL, POLICY_REFERENCE, API_REFERENCE, SUBMISSION_CHECKLIST)
- [x] Read server/*.ts files (policy.ts confirmed pure function)
- [x] Run baseline tests: 97/99 passing
- [x] Typecheck: clean

**Key Findings**:
- Policy engine is pure function ✅
- Reserve-then-execute semantics intact ✅
- Fail-closed hooks verified ✅
- Hash-chained ledger with known limits documented ✅
- PayPal sandbox only, clearly marked ✅

---

## PHASE 1: P0 Fixes (Day 1 - Nov 7)

### 1.1 Mandate Expiry Extension + Check
- [ ] Update mandate.json: `expiresAt: "2027-03-31T00:00:00Z"` (was 2026-11-30)
- [ ] Add check in `npm run doctor` that fails if mandate expires within 60 days
- [ ] Add test: `test('mandate must not expire within 60 days of judging', ...)`
- [ ] Update POLICY_REFERENCE.md with expiry requirement

### 1.2 Ledger Mode Column (Per-Row Mode Display)
- [ ] Update ledger schema: store `mode: 'sim'|'live'` in payload at write time
- [ ] Update `server/ledger.ts`: add mode to payload JSON when appending rows
- [ ] Update `web/src/Ledger.tsx`: add "Mode" column to AG Grid
- [ ] Update `server/ledger.ts` `verifyChain()`: handle old rows without mode gracefully
- [ ] Add test: verify old ledger rows without mode still validate
- [ ] Add migration note in CHANGELOG.md

### 1.3 Reseed Script (Fresh Sandbox Data)
- [ ] Create `scripts/reseed.mjs`: calls PayPal Orders v2 to create fresh captures
- [ ] Document in README how to use: `npm run reseed` 
- [ ] Add date check: warn if captures > 25 days old (approaching 30-day return window)
- [ ] Update package.json with `"reseed": "node scripts/reseed.mjs"`
- [ ] Test: run reseed and verify demo still works

### 1.4 Ledger Tamper Demo Button
- [ ] Add env var check: `REIN_DEMO_TAMPER=1` (off by default)
- [ ] Add button in `/ledger` UI: "Simulate Tamper" (only shows if env var set)
- [ ] Button handler: edit a random past ledger row in DB
- [ ] Show "Verify Chain" button that runs verification and displays result
- [ ] Result shows RED/broken chain icon when tampered
- [ ] Update DEMO_SCRIPT.md with tamper demo instructions
- [ ] Add test: verify tamper is detectable

**Commit**: `feat(p0): mandate expiry extension, per-row mode, reseed, tamper demo`

---

## PHASE 2: Rename Rein → Rein (Day 1-2 - Nov 7-8)

### 2.1 Core Renames
- [ ] package.json: name, description
- [ ] README.md: all references Rein → Rein
- [ ] All docs/*.md files
- [ ] UI copy in web/src/*.tsx
- [ ] MCP server name: rein-paypal → rein-paypal
- [ ] Hook files: rein-hook.mjs → rein-hook.mjs
- [ ] CLI scripts: references in scripts/*.mjs
- [ ] Database filename: rein.db → rein.db
- [ ] Ledger/seal text
- [ ] Error messages, log prefixes
- [ ] HTTP headers (X-Rein-* → X-Rein-*)
- [ ] Video project text in video/

### 2.2 Environment Variables Migration
- [ ] Introduce REIN_* vars: REIN_TOKEN, REIN_DB, REIN_PUBLIC_URL, REIN_MANDATE, REIN_MODE, etc.
- [ ] Keep REIN_* as deprecated fallbacks (with console warning)
- [ ] Update .env.example
- [ ] Update tests to use REIN_*
- [ ] Update render.yaml
- [ ] Document deprecation in CHANGELOG.md

### 2.3 Verification
- [ ] Run `git grep -i rein` → should find ONLY: deprecation shims, CHANGELOG note, LICENSE credits
- [ ] Fix repo tree in README (currently says "paypal-hackathon-devpost")
- [ ] Verify MIT license intact
- [ ] Verify contributor credits unchanged

**Commit**: `refactor: rename Rein → Rein with deprecated REIN_* fallbacks`

---

## PHASE 3: PayPal-Native Truth with APIMatic (Day 2-3 - Nov 8-9)

### 3.1 APIMatic ContextMatic Setup
- [ ] Install APIMatic ContextMatic MCP plugin
- [ ] Use it to query authoritative PayPal Server SDK docs
- [ ] Document in README: "APIMatic ContextMatic was used to verify PayPal API contracts"
- [ ] Record queries made and answers received in docs/Product/APIMATIC_USAGE.md

### 3.2 Order Line Items from PayPal
- [ ] Update `scripts/seed.mjs`: create Orders v2 with purchase_units[].items + amount.breakdown.item_total
- [ ] Add capture → order → GET order resolution in server/paypal.ts
- [ ] Map PayPal items into order_items table in transaction
- [ ] Remove hardcoded ITEMS from scripts/seed-db.mjs
- [ ] Add error handling: if items cannot be read, refund_items escalates/blocks
- [ ] Add test: unknown order without items → escalate

### 3.3 PayPal Custom ID for Idempotency
- [ ] Set `custom_id = actionId` on refund requests
- [ ] Verify field name in PayPal API docs via APIMatic
- [ ] Test: verify custom_id appears in sandbox refund response

### 3.4 PayPal Webhooks
- [ ] Add POST /v1/webhooks/paypal endpoint
- [ ] Implement signature verification (PayPal verify-webhook-signature)
- [ ] Handle PAYMENT.CAPTURE.REFUNDED event
- [ ] Handle CUSTOMER.DISPUTE.CREATED event
- [ ] Reject unverified events (log + 401)
- [ ] Add test: verified webhook accepted, unverified rejected

### 3.5 Reconciler for Unknown Outcomes
- [ ] Add reconciler job: read order's refunds from PayPal
- [ ] Match by custom_id = actionId
- [ ] Settle or release reservation via result()
- [ ] Ledger every transition (unknown → executed/failed)
- [ ] Add test: unknown outcome eventually reconciles

### 3.6 OpenAPI 3.1 Spec + SDK Generation
- [ ] Write accurate OpenAPI 3.1 spec for /v1 endpoints
- [ ] Use docs/API/API_REFERENCE.md and server/app.ts as source
- [ ] Validate spec against running server
- [ ] Generate SDK with APIMatic
- [ ] Write short usage example in docs/API/SDK_USAGE.md
- [ ] Add spec file: docs/api/openapi.yaml

**Commit**: `feat(paypal): native order items, webhooks, reconciler, OpenAPI SDK`

---

## PHASE 4: Render Deployment (Day 3 - Nov 9)

### 4.1 Render.yaml Real Deploy
- [ ] Configure persistent disk for DB (or document ephemeral tradeoff)
- [ ] Set up environment variables (REIN_TOKEN, PAYPAL_*, etc.)
- [ ] Configure public URL
- [ ] Add health check endpoint verification
- [ ] Enforce single instance only (document in render.yaml comments)
- [ ] Test deploy to Render

### 4.2 Render Workflows for Reconciler & Attack Lab
- [ ] Install @renderinc/sdk
- [ ] Create TypeScript workflow tasks with retry config
- [ ] Tasks call authenticated API endpoints (no direct SQLite access)
- [ ] Reconciler task: periodic job to check unknown outcomes
- [ ] Attack Lab task: run adversarial benchmarks (see Phase 6)
- [ ] Document workflow configuration

### 4.3 Deployment Documentation
- [ ] Write step-by-step deploy docs in docs/Deployment/DEPLOYMENT_GUIDE.md
- [ ] Add live URL placeholder in README (update after deploy)
- [ ] Document environment variables required
- [ ] Add troubleshooting section

**Commit**: `feat(deploy): Render deployment with workflows and persistent storage`

---

## PHASE 5: Channel3 Price-Match (Agentic Commerce) (Day 4 - Nov 10)

### 5.1 Price Adjust Tool
- [ ] Install @channel3/sdk
- [ ] Add new MCP tool: `price_adjust(capture_id, item_id)`
- [ ] Agent names item only (no amount)
- [ ] Server looks up current market via Channel3
- [ ] Compute adjustment = our_price - lowest_verified_instock_price
- [ ] Apply existing caps to adjustment amount
- [ ] Pure function for computation (next to resolveItems)
- [ ] Add table tests for price adjustment logic

### 5.2 Error Handling & Policy Rules
- [ ] Channel3 failure → R-STATE-UNAVAILABLE escalation
- [ ] Low-confidence match → R-STATE-UNAVAILABLE
- [ ] Add R-PRICE-ANOMALY rule: escalate when price far outside market range
- [ ] Document in POLICY_REFERENCE.md

### 5.3 Evidence & Transparency
- [ ] Show evidence on approval page: matched product, offers, timestamp
- [ ] Store Channel3 response in ledger payload
- [ ] Cache responses for keyless demo
- [ ] Ship recorded fallback for demo without Channel3 key

### 5.4 Demo Ticket
- [ ] Add demo ticket 4: "I found it cheaper elsewhere"
- [ ] Configure test data for price-match scenario
- [ ] Update demo UI to include ticket 4

**Commit**: `feat(channel3): price-match tool for agentic commerce with R-PRICE-ANOMALY`

---

## PHASE 6: AI Centrality - Attack Lab & Ops Console (Day 4-5 - Nov 10-11)

### 6.1 Attack Lab (Claude-Driven Red Team)
- [ ] New route: /attack-lab
- [ ] Server-side Claude API integration (Anthropic API key server-side only)
- [ ] Generate N varied injection/social-engineering tickets
- [ ] Run each through real agent loop against MCP proxy (sim mode)
- [ ] Parallel execution via Render Workflows
- [ ] Aggregate metrics: attempts, $ requested, $ refunded, rules fired
- [ ] Include no-gate baseline lane for comparison
- [ ] Cap N and spend, add rate limiting
- [ ] Label as synthetic tickets on fake money
- [ ] Report results with confidence bounds and limits
- [ ] UI: attack results grid, charts showing blocked vs allowed

### 6.2 Ops Console (AG Studio Dashboard)
- [ ] Install ag-studio-react (45-day trial)
- [ ] New route: /ops
- [ ] KPI tiles: prevented loss, escalations, chain status
- [ ] Chart: $ blocked by rule (stacked bar or pie)
- [ ] Decisions grid with cross-filtering
- [ ] Implement AgAiAssistant adapter with Claude (server-side key)
- [ ] Strictly read-only: AI can query/chart, never refund/approve
- [ ] Test: ensure no license warnings in browser console

### 6.3 Enhanced Ledger with AG Grid Features
- [ ] Upgrade /ledger with master-detail rows
- [ ] Show item lines + hash links in detail
- [ ] Add row grouping by rule
- [ ] Add CSV export button
- [ ] Test: no license warnings

**Commit**: `feat(ai): Attack Lab red team + Ops Console with AG Studio dashboard`

---

## PHASE 7: Mandate Versions & Bryntum (STRETCH - Day 5)

⚠️ **SKIP IF BEHIND SCHEDULE**

### 7.1 Mandate Versioning
- [ ] Store mandates by version hash
- [ ] Record hash on every decision
- [ ] Support effective-from/to windows (e.g., holiday caps)
- [ ] Select by `now` timestamp
- [ ] Keep schema whitelist strict

### 7.2 Backtest Function
- [ ] Pure backtest function: replay actions against candidate mandate
- [ ] Report what would change
- [ ] Advisory "Mandate Copilot" may suggest candidates from shadow data
- [ ] Backtest produces the numbers (deterministic)

### 7.3 Bryntum Calendar & Scheduler
- [ ] Install Bryntum Calendar (trial, pinned versions)
- [ ] Edit seasonal windows UI
- [ ] Add read-only Scheduler timeline for pending approvals
- [ ] Show 15-minute expiry countdown
- [ ] Edits require token and are ledgered
- [ ] Install Bryntum Scheduler for approval timeline

**Commit**: `feat(bryntum): mandate versioning, backtesting, calendar & scheduler UI`

---

## PHASE 8: Complete UI Redesign (Day 5-6 - Nov 11)

### 8.1 Design Tokens (CSS Variables)
- [ ] Create web/src/styles.css with design tokens:
  - Navy #003087 (headings, nav)
  - Primary blue #0070E0 (links, actions)
  - Light blue #009CDE (accents)
  - Action gold #FFC439 (primary CTA, dark text)
  - Backgrounds: #F5F7FA (page), white (cards)
  - Borders: #D9DEE7
  - Text: #0C1424, muted #5E6C84
  - States: success #1A7F4B, warning #B25E00, danger #C4261D
- [ ] Verify WCAG AA contrast >= 4.5:1
- [ ] Typography: Inter (@fontsource) with Helvetica Neue/system fallbacks
- [ ] 16px base, clear type scale, tabular numerals for money
- [ ] Shape: pill buttons, 12-16px radius cards, soft shadows, 8px grid
- [ ] Document in docs/Frontend/DESIGN_SYSTEM.md

### 8.2 Layout & Navigation
- [ ] Left sidebar dashboard: Overview, Demo, Approvals, Ledger, Ops, Mandate, Attack Lab, Proof
- [ ] Top bar: SIMULATED / LIVE SANDBOX mode chip
- [ ] Mobile: collapse to bottom tab bar
- [ ] Responsive: 360px to 1440px

### 8.3 Page Redesigns
- [ ] **Landing/Overview**: hero with tagline, live "prevented loss" stat, 3-step explainer, demo teaser
- [ ] **Demo**: two-lane cards, animated outcome states, large tabular $ amounts, rule chips
- [ ] **Approve**: mobile-first payment review, amount hero, item list, rule chip, AI summary (labeled advisory), big Approve/Deny buttons, expiry countdown
- [ ] **Ledger**: consistent cards, tables, empty states, loading skeletons
- [ ] **Ops**: (see 6.2)
- [ ] **Mandate**: clean policy display
- [ ] **Author**: policy compiler UI
- [ ] **Proof**: sandbox verification display
- [ ] **Attack Lab**: (see 6.1)

### 8.4 Accessibility & Quality
- [ ] WCAG AA compliance
- [ ] Keyboard navigable
- [ ] Visible focus rings
- [ ] prefers-reduced-motion respected
- [ ] aria-live announcements preserved
- [ ] Test Lighthouse: accessibility 100 on all pages
- [ ] No layout shift (CLS < 0.1)

### 8.5 Screenshots
- [ ] Update Playwright e2e test for new UI
- [ ] Take fresh screenshots (desktop + mobile)
- [ ] Save to docs/assets/screenshots/
- [ ] Update README with new screenshots

**Commit**: `feat(ui): complete PayPal-inspired fintech redesign with accessibility`

---

## PHASE 9: README & Docs Rewrite (Day 6 - Nov 11)

### 9.1 README for Judges
- [ ] One-line pitch at top
- [ ] Hero + GIF (from new UI)
- [ ] "Why it matters" section with honest evidence limits
- [ ] 60-second quick start (no keys needed)
- [ ] Architecture diagram
- [ ] "What is real vs simulated" table
- [ ] Sponsor tools table: "How each tool was actually used"
- [ ] ReinBench/Attack Lab results with caveats
- [ ] Live demo URL (from Render deploy)
- [ ] Video link (YouTube)
- [ ] Criteria map (tech, design, impact, idea quality)
- [ ] Honest limitations section

### 9.2 Docs Cleanup
- [ ] Remove/archive internal planning (PRODUCT_PLAN.md, CEO codes, autoplan jargon)
- [ ] Keep: THREAT_MODEL, POLICY_REFERENCE, API_REFERENCE, SYSTEM_ARCHITECTURE, DEPLOYMENT, DESIGN_SYSTEM
- [ ] Refresh DOCUMENTATION_INDEX.md
- [ ] Consistent tone and formatting
- [ ] Update CHANGELOG.md with all changes

### 9.3 Devpost Submission Text
- [ ] Rewrite docs/Product/DEVPOST_SUBMISSION.md
- [ ] Match only what shipped
- [ ] Evidence table at end
- [ ] Clear claim → evidence mapping

### 9.4 Video Script & Shot List (2:40)
- [ ] Shot list:
  1. Live URL landing page (0:00-0:10)
  2. Two-lane demo: injected attack blocked (0:10-0:40)
  3. Price-match demo with Channel3 (0:40-1:00)
  4. Attack Lab results (1:00-1:20)
  5. Ops console with AI assistant (1:20-1:40)
  6. Human approval on phone (1:40-2:00)
  7. Ledger tamper demo (verify turns red) (2:00-2:20)
  8. Closing: sponsor logos, call to action (2:20-2:40)
- [ ] Update video/src scripts
- [ ] No third-party trademarks
- [ ] No copyrighted music
- [ ] Record and edit video
- [ ] Upload to YouTube (unlisted first, then public)

**Commit**: `docs: comprehensive rewrite for hackathon judges with evidence tables`

---

## PHASE 10: Final Verification (Day 6 - Nov 11 evening)

### 10.1 Automated Checks
- [ ] Run typecheck (all 3 tsconfig files)
- [ ] Run full tests on both drivers
- [ ] Run e2e tests (if Chromium available)
- [ ] Run `npm run doctor`
- [ ] Secret scan over full git history
- [ ] Rename grep: `git grep -i rein` (should be zero hits except shims)
- [ ] Clean-clone quickstart test

### 10.2 Submission Checklist
- [ ] Go through docs/Product/SUBMISSION_CHECKLIST.md line by line
- [ ] Verify evidence for each claim
- [ ] Check video < 3:00
- [ ] Verify no third-party trademarks in video
- [ ] Verify open source license visible
- [ ] Verify all materials in English
- [ ] Verify demo works without keys (sim mode)
- [ ] Verify hosted demo is live

### 10.3 Pre-Submission
- [ ] Final commit: "chore: ready for submission"
- [ ] Tag: v1.0.0-hackathon
- [ ] Push to GitHub
- [ ] Verify repo is public
- [ ] Test clone and run on fresh machine

**Commit**: `chore: final verification and submission prep`

---

## Risk Mitigation & Contingencies

### Critical Path (Cannot Cut)
1. Phase 1 (P0 fixes) - MUST DO
2. Phase 2 (Rename) - MUST DO
3. Phase 3 (PayPal native truth) - MUST DO
4. Phase 4 (Render deploy) - MUST DO
5. Phase 8 (UI redesign) - MUST DO
6. Phase 9 (Docs/README) - MUST DO
7. Phase 10 (Verification) - MUST DO

### Cut Priority (If Time Short)
1. **First to cut**: Phase 7 (Bryntum - stretch goal)
2. **Second to cut**: Extra Phase 6 features (keep Attack Lab, may simplify Ops Console)
3. **Third to cut**: Channel3 exchange suggestions (keep core price-match)

### Blockers & Alternatives
- **Missing APIMatic key**: Document what we tried, continue with manual PayPal docs
- **Missing Channel3 key**: Use recorded fallback data, clearly mark as simulated
- **Render deploy issues**: Fall back to local demo URL with ngrok/localhost instructions
- **AG Grid license warnings**: Document trial period, note in README
- **Bryntum license**: Already marked as stretch, skip if needed

### Daily Progress Check
- **End of Day 1**: Phases 1-2 complete
- **End of Day 2**: Phase 3 complete
- **End of Day 3**: Phase 4 complete
- **End of Day 4**: Phases 5-6 complete
- **End of Day 5**: Phases 7-8 complete
- **End of Day 6**: Phases 9-10 complete, SUBMIT

---

## Success Criteria

### Functional
- ✅ All non-negotiables preserved (pure policy, fail-closed, sandbox only, honest claims)
- ✅ PayPal + AI integration working end-to-end
- ✅ Agentic commerce (price-match) demonstrated
- ✅ Attack Lab showing AI-driven red team
- ✅ Ops Console showing AI assistant (read-only)
- ✅ Demo works without keys (sim mode)
- ✅ Hosted demo live and accessible

### Quality
- ✅ Typecheck clean
- ✅ Tests passing (>95%)
- ✅ Lighthouse accessibility 100
- ✅ No third-party trademarks
- ✅ Honest limitations documented
- ✅ Evidence tables for all claims

### Submission
- ✅ Video < 3:00 uploaded to YouTube
- ✅ README clear and compelling
- ✅ Devpost submission complete
- ✅ Submitted by Nov 11, 11:59 PM
- ✅ All materials in English
- ✅ Public repo with clear instructions

---

## Next Steps

1. Begin Phase 1 immediately
2. Commit after each phase
3. Test continuously
4. Document as we go
5. Daily progress reports (5 lines: done / not done / not verified / needs from me / next)

Let's build a winning entry! 🏆
