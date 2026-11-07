# Worklog

## F0 FIXES
- [x] Fix 3 failing tests in tests/new-features.test.ts (ALREADY PASSING)
- [ ] Fix contention test flake (database locked on Windows)
- [x] Wire computePriceMatchAdjustment into price_match_refund tool (ALREADY DONE)
- [x] Replace repetitive Attack Lab vectors with distinct ones (ALREADY DISTINCT)
- [x] Delete REIN_*.md, PROJECT_INDEX.md (ALREADY DONE)
- [x] Rename --paypal-dark-blue to --navy (ALREADY --navy in CSS)
- [x] Gitignore node_modules (ALREADY IN .gitignore)
- [ ] Check AG Grid license warnings in browser console

## F1 ROBUSTNESS (FOCUSING ON CRITICAL ITEMS)
- [ ] Security hardening (constant-time compare, rate limits, secret redaction)
- [ ] Failure tests (crash recovery, double-click, concurrent races)
- [ ] npm audit vulnerabilities
- [CUT] fast-check property tests (time-intensive, not critical path)
- [CUT] Benchmark script (nice-to-have)
- [ ] Update THREAT_MODEL.md with current state

## F2 FOUNDATION
- [ ] Generalize engine to generic money action
- [ ] Mandate-version store

## F3 FEATURES
- [ ] A. Beat the Gate + adaptive red-team + signed checkpoints + auditor export
- [ ] B. Payouts + subscriptions + disputes
- [ ] C. Buyer purchases + exchange suggestions
- [ ] D. Policy intelligence
- [ ] E. Approvals platform + SDK + integrations

## F4 PRODUCT FINISH
- [ ] UI redesign
- [ ] Screenshots
- [ ] render.yaml + DEPLOY_RENDER.md

## F5 FINAL
- [ ] README rewrite
- [ ] DEVPOST_SUBMISSION.md
- [ ] Video shot list
- [ ] Final verification
- [ ] Delete WORKLOG.md
