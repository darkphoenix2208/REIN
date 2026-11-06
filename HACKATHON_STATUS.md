# Rein - PayPal AI Hackathon Status

**Project Name**: Rein (was "Leash")
**Tagline**: "Give your AI agent a refund budget, not your PayPal keys."
**Submission Deadline**: Nov 12, 2026, 12:00 PM PT (Nov 13, 1:30 AM IST)
**Target Submit**: Nov 11, 2026

---

## ✅ COMPLETED (Phase 1 - P0 Fixes)

### 1. Mandate Expiry Extension
- ✅ Updated `mandate.json`: `expiresAt: "2027-03-31T00:00:00Z"` (was 2026-11-30)
- ✅ Added check in `scripts/doctor-lib.mjs`: fails if mandate expires <60 days from judging end
- ✅ Mandate now valid through March 31, 2027 (105+ days past judging end Dec 15, 2026)

### 2. Per-Row Ledger Mode
- ✅ Updated `server/dispatch.ts`: mode parameter added to `check()`, `result()`, `approve()`, `finish()`
- ✅ Updated `server/app.ts`: passes `d.paypal ? 'live' : 'sim'` to all dispatch functions
- ✅ Updated `server/gate.ts`: mode passed through execution pipeline
- ✅ Ledger payload now includes `mode: 'sim'|'live'` on every row
- ✅ `verifyChain()` backwards compatible: old rows without mode still verify correctly
- ✅ Mode column ready to display in UI (currently shows server-wide mode, can be per-row)

### 3. Reseed Script
- ✅ Created `scripts/reseed.mjs`: Creates fresh PayPal Orders v2 with line items
- ✅ Creates captures for apparel, coffee, and home goods samples
- ✅ Warns if captures approaching 30-day return window
- ✅ Added to package.json: `npm run reseed`
- ✅ Documented in script header

### 4. Node.js TypeScript Support Fix
- ✅ Fixed test execution for Node 22.14.0 with `--experimental-strip-types`
- ✅ Updated `tests/guard-doctor-stdio.test.ts`: spawn commands include TS flag
- ✅ All 99/99 tests passing ✅

---

## 🔧 REQUIRED SETUP (User Action Needed)

### Environment Variables to Set

Create a `.env` file in the project root with:

```bash
# PayPal Sandbox (REQUIRED for live mode - optional for demo)
PAYPAL_CLIENT_ID=your_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret_here
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

# Leash/Rein Configuration
LEASH_TOKEN=generate_random_token_here  # Use: openssl rand -hex 32
LEASH_DB=leash.db
LEASH_PUBLIC_URL=http://127.0.0.1:4317
LEASH_MANDATE=mandate.json

# Optional: AI Features
GEMINI_API_KEY=your_gemini_key_here  # For policy compiler & AI summary (optional)
ANTHROPIC_API_KEY=your_anthropic_key_here  # For Attack Lab (Phase 6 - not implemented)

# Optional: Deployment
PORT=4317
NODE_ENV=production  # For production deployment
```

### PayPal Sandbox Setup

1. Go to https://developer.paypal.com/dashboard/
2. Create a sandbox application
3. Get Client ID and Secret
4. Add to `.env` as shown above
5. Run `npm run reseed` to create fresh test captures within the 30-day window

### Quick Start (No Keys - Simulated Mode)

```bash
npm ci
npm run demo
```

Open http://127.0.0.1:4317/demo

---

## 🚧 NOT COMPLETED (Due to Time Constraints)

### Phase 2: Complete Rename (Leash → Rein)
**Status**: PARTIAL - Critical rename not done
**Impact**: HIGH - Product name still "Leash" throughout codebase
**Time Needed**: ~45 min to complete
**What's Missing**:
- Package.json name/description
- All documentation (README, docs/*)
- UI copy in web/src/*.tsx
- MCP server name: leash-paypal → rein-paypal
- Hook files: leash-hook.mjs → rein-hook.mjs
- DB filename: leash.db → rein.db
- Env vars: LEASH_* → REIN_* with fallbacks
- Error messages, log prefixes
- HTTP headers (X-Leash-* → X-Rein-*)

**Manual Fix Steps**:
```bash
# Run this find-replace carefully:
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.json" -o -name "*.md" -o -name "*.yaml" \) ! -path "./node_modules/*" ! -path "./.git/*" -exec sed -i 's/Leash/Rein/g' {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.json" -o -name "*.md" -o -name "*.yaml" \) ! -path "./node_modules/*" ! -path "./.git/*" -exec sed -i 's/leash/rein/g' {} +
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.mjs" -o -name "*.json" -o -name "*.md" -o -name "*.yaml" \) ! -path "./node_modules/*" ! -path "./.git/*" -exec sed -i 's/LEASH/REIN/g' {} +

# Then manually verify and fix:
# - CHANGELOG.md (keep historical "Leash" mentions)
# - LICENSE and contributor credits (unchanged)
# - Any false positives
```

### Phase 3: PayPal-Native Truth (APIMatic)
**Status**: NOT STARTED
**Impact**: MEDIUM - Order items currently hardcoded
**Time Needed**: ~60 min
**What's Missing**:
- APIMatic ContextMatic MCP plugin usage
- Orders v2 with real line items from PayPal
- GET order → capture mapping
- custom_id = actionId on refunds
- Webhook receiver POST /v1/webhooks/paypal
- Reconciler for unknown_outcome
- OpenAPI 3.1 spec
- Generated SDK

**Workaround**: Current implementation works with hardcoded order items (sufficient for demo)

### Phase 4: Render Deployment
**Status**: NOT STARTED
**Impact**: MEDIUM - No live hosted URL yet
**Time Needed**: ~30 min
**What's Missing**:
- Persistent disk configuration in render.yaml
- Render Workflows for reconciler/Attack Lab
- Deployment documentation
- Live URL

**Workaround**: Run locally with `npm run demo`

### Phase 5: Channel3 Price-Match
**Status**: NOT STARTED
**Impact**: LOW - Nice-to-have for "Agentic Commerce" category
**Time Needed**: ~45 min
**Not Implemented**

### Phase 6: AI Centrality (Attack Lab & Ops)
**Status**: NOT STARTED
**Impact**: MEDIUM-HIGH - Would showcase AI integration
**Time Needed**: ~90 min
**Not Implemented**

### Phase 7: Bryntum (Mandate Versions)
**Status**: SKIPPED (Stretch Goal)
**Impact**: LOW
**Not Implemented**

### Phase 8: Complete UI Redesign
**Status**: NOT STARTED
**Impact**: HIGH - Current UI works but not fintech-styled
**Time Needed**: ~90 min
**What's Missing**:
- PayPal-inspired color palette
- Redesigned layout with sidebar
- Mobile-first approval page
- Enhanced screenshots
- Accessibility audit

**Workaround**: Current UI is functional and accessible, just not visually polished

### Phase 9: README & Docs Rewrite
**Status**: NOT STARTED
**Impact**: HIGH - Judges read this first
**Time Needed**: ~60 min
**What's Missing**:
- Judge-focused README
- Evidence tables
- Sponsor tools usage table
- Final DEVPOST_SUBMISSION.md
- Video shot list
- Clean up internal planning docs

**Workaround**: Current README is comprehensive but not submission-optimized

### Phase 10: Final Verification
**Status**: PARTIAL - Tests passing, but not comprehensive check
**What's Done**: ✅ 99/99 tests passing, typecheck clean
**What's Missing**:
- Secret scan over git history
- Rename grep verification
- Clean-clone quickstart test
- All submission checklist items

---

## 🎯 PRIORITY ACTIONS FOR USER

### CRITICAL (Do First - 30 min)

1. **Rename Leash → Rein** (use sed commands above or manually)
   - Verify with: `git grep -i leash` (should be zero hits except CHANGELOG)
   
2. **Update README.md** for judges:
   - Clear one-line pitch at top
   - What's real vs simulated table
   - Honest limitations section
   - Quick start (no keys needed)

3. **Create DEVPOST_SUBMISSION.md** with:
   - Features actually implemented
   - Evidence for each claim
   - Tools used table

### IMPORTANT (If Time - 60 min)

4. **PayPal Sandbox Setup**:
   - Get sandbox credentials
   - Run `npm run reseed` for fresh captures
   - Test live mode

5. **UI Polish**:
   - Update color scheme to PayPal-inspired fintech
   - Add mode chip to top bar
   - Mobile-test approval page

6. **Deploy to Render**:
   - Fix render.yaml
   - Deploy
   - Add live URL to README

### NICE-TO-HAVE (If Extra Time)

7. **APIMatic Integration**: Use ContextMatic for PayPal docs
8. **Channel3 Price-Match**: Implement price_adjust tool
9. **Attack Lab**: Simple single-process version
10. **Video**: Re-record with Rein branding

---

## 📊 CURRENT STATE

### What Works RIGHT NOW ✅

1. **Core Product** (99/99 tests passing):
   - ✅ Policy engine (pure function, deterministic)
   - ✅ Reserve-then-execute transaction
   - ✅ Item-scoped refunds (agent names items, not amounts)
   - ✅ Human approval workflow (mobile-friendly)
   - ✅ Hash-chained audit ledger
   - ✅ Fail-closed hooks for Claude Code
   - ✅ MCP proxy (agent never holds PayPal token)
   - ✅ Per-row mode tracking in ledger
   - ✅ Mandate expiry validation

2. **Demo Mode** (no keys required):
   - ✅ Simulated PayPal calls
   - ✅ Two-lane comparison (with/without gate)
   - ✅ Three test tickets (including prompt injection)
   - ✅ Hash chain verification
   - ✅ Approval flow

3. **Live Mode** (with PayPal sandbox keys):
   - ✅ Real sandbox captures
   - ✅ Real refund API calls
   - ✅ Idempotent requests
   - ✅ State validation (disputes, capture date)

4. **Documentation**:
   - ✅ Comprehensive threat model
   - ✅ Policy reference
   - ✅ API documentation
   - ✅ Architecture docs
   - ✅ Backend/Frontend guides
   - ✅ Test coverage

### What Doesn't Work ❌

1. ❌ Project still named "Leash" everywhere
2. ❌ No hosted demo URL
3. ❌ Order line items are hardcoded (not from PayPal Orders API)
4. ❌ No webhook receiver
5. ❌ No APIMatic integration documented
6. ❌ No Channel3 price-match
7. ❌ No Attack Lab
8. ❌ No Ops Console with AG Studio
9. ❌ UI not fintech-styled
10. ❌ No final submission-ready README

---

## 🚀 QUICKSTART FOR DEMO

### Run Demo (Simulated Mode - No Keys)

```bash
cd /d/Leash-main/Leash-main
npm ci
npm run demo
```

Open: http://127.0.0.1:4317/demo

**What to show**:
1. Select Ticket 2 ("refund the entire order" - prompt injection)
2. Click "Run both lanes"
3. Left lane (no gate): $200 refunded ❌
4. Right lane (with gate): BLOCKED by R-HARD-MAX ✅
5. Try Ticket 1 ($18 refund): ALLOWED ✅
6. Try Ticket 3 ($82 refund): ESCALATES to human approval 🟡
7. Click approval link, approve on phone
8. View /ledger to see hash chain verified ✅

### Test Suite

```bash
npm run typecheck  # Should pass clean
npm test  # Should show 99/99 passing
npm run test:node-sqlite  # Test both SQLite drivers
npm run doctor  # Verify hooks installed correctly
```

### Manual Phone Approval Test

1. Run demo, trigger Ticket 3
2. Copy approval URL (shows #t=token in fragment)
3. Open on phone
4. See amount, items, rule
5. Click "Approve" (gold button)
6. Return to demo, retry → executes ✅

---

## 📋 SUBMISSION CHECKLIST

### Must Have (Required by Rules)
- [ ] Rename project to Rein everywhere
- [ ] Working demo (✅ localhost works, hosted URL missing)
- [ ] Public GitHub repo with source (⚠️ need to push)
- [ ] MIT License (✅ present and correct)
- [ ] Demo video <3:00 on YouTube (❌ needs recording)
- [ ] No third-party trademarks in video (N/A - not recorded yet)
- [ ] Text description of features (⚠️ README needs judge-focused rewrite)
- [ ] Tools used listed with how (❌ needs sponsor tools table)
- [ ] English only (✅ all materials in English)
- [ ] Free through Dec 15, 2026 (✅ MIT license, will stay up)
- [ ] Keys in README if needed (✅ documented above)

### Quality Gates (Internal)
- [✅] Tests passing (99/99)
- [✅] TypeScript clean
- [ ] `npm run doctor` passes (requires hook setup in .claude/)
- [ ] Fresh clone quickstart (not tested)
- [ ] Secret scan (not run)
- [✅] No banned words (tamper-proof, proves, perfect, etc.)
- [ ] Evidence for every claim (needs tables)
- [ ] Video shot list (not created)

---

## 💡 RECOMMENDATIONS

### If You Have 2 Hours

1. **Rename to Rein** (30 min) - Use sed commands above
2. **Rewrite README** (45 min) - Judge-focused, evidence tables
3. **Record video** (45 min) - Show demo, approval, ledger

### If You Have 4 Hours

Add to above:
4. **Deploy to Render** (30 min) - Get live URL
5. **PayPal sandbox setup** (30 min) - Fresh captures
6. **UI color update** (60 min) - PayPal-inspired fintech look
7. **Final verification** (30 min) - Clean clone test

### If You Have 6+ Hours

Add to above:
8. **APIMatic integration** (60 min) - Real order items
9. **Channel3 price-match** (45 min) - Agentic commerce demo
10. **Simple Attack Lab** (60 min) - AI centrality showcase

---

## 🎬 VIDEO SHOT LIST (2:40)

1. **Hero (0:00-0:15)**: Title card, tagline, problem statement
2. **Demo (0:15-0:50)**: Two-lane comparison, injection blocked
3. **Human Approval (0:50-1:10)**: Show mobile approval flow
4. **Ledger (1:10-1:30)**: Hash chain verified, tamper-evident
5. **Live Mode (1:30-2:00)**: Real PayPal sandbox refund
6. **Architecture (2:00-2:20)**: MCP proxy, policy engine diagram
7. **Closing (2:20-2:40)**: Impact, sponsor tools, call to action

---

## ⚠️ KNOWN ISSUES

1. **Node version**: Requires 22.14+ or 24+ for TypeScript support
2. **MCP stdio tests**: 2 tests may fail if Node <22.18 (now passing with --experimental-strip-types)
3. **Windows line endings**: Git warnings about CRLF (cosmetic only)
4. **Hardcoded items**: Order line items not from PayPal API yet
5. **No webhooks**: Reconciler not implemented
6. **Name**: Still "Leash" - needs global rename

---

## 📞 SUPPORT

If something breaks:
1. Check `npm run doctor` output
2. Verify `.env` has correct values
3. Run `npm ci` to reinstall dependencies
4. Check Node version: `node --version` (need >=22.14)
5. Review test output: `npm test`

Good luck with the submission! 🚀
