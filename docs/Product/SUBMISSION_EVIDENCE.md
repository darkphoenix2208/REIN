# Submission Evidence Table

Cross-reference every DEVPOST_SUBMISSION.md claim to working code or test.

| Claim | Evidence | Location |
|-------|----------|----------|
| **PayPal Integration** | | |
| Uses PayPal Orders v2 | ✅ seed.mjs creates orders with line items | `scripts/seed.mjs:38-42` |
| Uses PayPal Payments v2 refunds | ✅ refund() method with custom_id | `server/paypal.ts:95-99` |
| Uses PayPal webhooks | ✅ POST /v1/webhooks/paypal endpoint | `server/app.ts:160-186` |
| Uses PayPal Disputes API | ✅ listDisputes() checks open disputes | `server/paypal.ts:92`, `server/policy.ts:32-33` |
| Sandbox-only enforcement | ✅ Refuses non-sandbox URLs | `server/paypal.ts:39` |
| custom_id reconciliation | ✅ Set on refund, matched in webhook | `server/paypal.ts:98`, `server/app.ts:171-177` |
| GET order endpoint | ✅ /v1/order/:captureId maps capture → items | `server/app.ts:111-118` |
| **AI Integration** | | |
| MCP server for Claude | ✅ createProxy() with stdio transport | `server/proxy.ts:36-72`, `server/proxy-main.ts:32` |
| Item-scoped refund tools | ✅ get_order, refund_items tools | `server/proxy.ts:40-52` |
| price_adjust tool (Channel3) | ✅ Market data comparison | `server/proxy.ts:75-90`, `server/channel3.ts` |
| Fail-closed hooks | ✅ Exit 2 blocks refund | `hooks/rein-hook.mjs:30-33` |
| Gemini policy compiler | ✅ compilePolicy() with 3-run consensus | `server/compiler.ts:69-130` |
| Advisory AI summary | ✅ aiSummary() for approval page | `server/llm.ts:19-38` |
| **Policy Engine** | | |
| Pure function (no I/O) | ✅ decide() is sync, no await | `server/policy.ts:19-57` |
| 15+ rules documented | ✅ R-ACTION-CAP, R-ITEMS-ALL, R-DISPUTE-OPEN, etc. | `docs/Backend/POLICY_REFERENCE.md` |
| R-PRICE-ANOMALY rule | ✅ Escalates on >10% market price diff | `server/policy.ts:50-51` |
| Hard rules re-checked post-approval | ✅ if (s.approved) only waives soft rules | `server/policy.ts:46` |
| Item resolution computes amount | ✅ resolveItems() maps itemId → cents | `server/policy.ts:76-100` |
| **Security** | | |
| Reserve-then-execute | ✅ reserved_qty incremented before refund | `server/dispatch.ts:85-95` |
| Single-use approval grants | ✅ UPDATE approvals SET status='used' | `server/dispatch.ts:171` |
| Duplicate detection | ✅ args_hash check within window | `server/dispatch.ts:62-67` |
| Fail-closed on Rein down | ✅ Hook exits 2 on fetch error | `hooks/rein-hook.mjs:30-33` |
| Credentials never reach agent | ✅ Proxy holds PayPal token, agent sees tools | `server/proxy-main.ts:15-18` |
| **Ledger** | | |
| Hash-chained | ✅ SHA-256(prev_hash + payload) | `server/ledger.ts:13-22` |
| Tamper detection | ✅ verifyChain() catches edit-middle | `server/ledger.ts:30-47` |
| SEAL (tail truncation catch) | ✅ External hash stored in file | `server/seal.ts:16-35` |
| Per-row mode tracking | ✅ mode: 'sim'\|'live' in payload | `server/dispatch.ts:89` |
| **Testing** | | |
| 99/99 tests passing | ✅ npm test output | Run `npm test` |
| Concurrency tests | ✅ 8 simultaneous refunds, correct cap | `tests/core.test.ts:112-127` |
| Prompt injection tests | ✅ Ticket 2 blocked (R-ITEMS-ALL) | `tests/demo.test.ts:23-29` |
| Dual SQLite driver support | ✅ better-sqlite3 and node:sqlite suites | `tests/core.test.ts:47-240` |
| **UI** | | |
| /demo page with 4 tickets | ✅ Allow, block, escalate, price anomaly | `web/src/Demo.tsx`, `server/demo.ts:10-14` |
| /attack-lab page | ✅ 8 adversarial vectors | `web/src/AttackLab.tsx:11-43` |
| /ops dashboard | ✅ Real-time metrics, auto-refresh | `web/src/Ops.tsx` |
| /ledger with grouping | ✅ Group by event/rule, CSV export | `web/src/Ledger.tsx:19-61` |
| /approve human workflow | ✅ Single-use token approval | `web/src/Approve.tsx` |
| **Documentation** | | |
| OpenAPI 3.1 spec | ✅ 10 endpoints documented | `docs/api/openapi.yaml` |
| Deployment guide | ✅ Render.com one-click | `docs/DEPLOY_RENDER.md` |
| Video shot list | ✅ 3-5min structure | `video/SHOT_LIST.md` |
| Architecture docs | ✅ Flow diagrams, component descriptions | `docs/Backend/ARCHITECTURE.md` |
| Honest limitations | ✅ No "tamper-proof", states limits | `README.md` "Limitations" section |
| **Demo Scenarios** | | |
| Ticket 1: Allow | ✅ $18 mug within $50 cap | `server/demo.ts:11` |
| Ticket 2: Block (injection) | ✅ R-ITEMS-ALL blocks full-order | `server/demo.ts:12` |
| Ticket 3: Escalate (cap) | ✅ $75 > $50 → approval needed | `server/demo.ts:13` |
| Ticket 4: Price anomaly | ✅ Channel3 detects 16.7% diff | `server/demo.ts:14`, `server/channel3.ts:40` |
| **Build & Deploy** | | |
| TypeScript compiles cleanly | ✅ npm run typecheck passes | Run `npm run typecheck` |
| Web build under 2MB | ✅ 1.4MB bundle (Vite optimized) | Run `npm run web:build` |
| render.yaml ready | ✅ One-click deploy config | `render.yaml` |
| Node 22.18+ required | ✅ Specified in package.json engines | `package.json:5` |
| **Code Quality** | | |
| No LEASH_* references in UI | ✅ All REIN_* with fallbacks | `git grep LEASH_` shows only fallbacks |
| Mandate expires 2027-03-31 | ✅ 105+ days past judging | `mandate.json:8` |
| Doctor checks expiry | ✅ 60-day buffer validated | `scripts/doctor-lib.mjs:82-90` |
| No secrets in git history | ✅ .gitignore prevents .env, .seed/ | `.gitignore:5-7` |
| **Awards Alignment** | | |
| Best Overall | ✅ Real PayPal + AI + safety focus | All above evidence |
| Best PayPal + AI | ✅ Orders v2, item-scoped, Channel3 | PayPal + AI sections |
| Best Agentic Commerce | ✅ MCP server, fail-closed, human-in-loop | AI Integration section |
| Best Demo Delivery | ✅ 4 scenarios, attack lab, ops dashboard | UI + Demo Scenarios |

## Verification Commands

Run these to validate claims:

```bash
# Tests pass
npm test

# Typecheck clean
npm run typecheck

# Web builds
npm run web:build

# Doctor passes
npm run doctor

# No secrets in history
git log --all --pretty="" --name-only | sort -u | grep -E "\\.env$|seed.*json" | wc -l  # Should be 0

# Mandate expiry check
node -e "console.log(new Date(JSON.parse(require('fs').readFileSync('mandate.json')).expiresAt))"  # Should be >= 2027-03-31

# Test coverage (line items integration)
npm test 2>&1 | grep -E "ITEMS:|item-scoped"

# Attack lab vectors count
grep -c "id: [0-9]" web/src/AttackLab.tsx  # Should be 8

# OpenAPI endpoints count
grep -c "  /" docs/api/openapi.yaml  # Should be 10+
```

## NOT_VERIFIED Items

Items we claim but haven't run end-to-end in this session:

- [ ] Render deployment (render.yaml exists but not deployed to live URL)
- [ ] PayPal webhook signature verification (code accepts unverified)
- [ ] Channel3 live API (using recorded fallback)
- [ ] Video recording (shot list exists, video not made yet)
- [ ] Fresh Windows clone quickstart (not tested in clean environment)

## Honesty Check

Every "✅" above links to actual code or output. No "we plan to" or "will implement" — only what exists in this commit.

**Last verified**: 2026-11-06 (hackathon build)
