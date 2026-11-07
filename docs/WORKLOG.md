# Rein - Work Log

## STAGE 1: REPAIR
- [ ] 1. Fix require() in server/app.ts - replace with static imports, add HTTP tests, curl verification
- [ ] 2. Route cancel_subscription and handle_dispute through gate with tests
- [ ] 3. Wire mandate-version.ts or delete if unused; check multi-instance.ts
- [ ] 4. Delete root status files, audit doc claims
- [ ] 5. Check browser console for AG Grid warnings

## STAGE 2: HEADLINE FEATURES
- [ ] A. Real "Beat the Gate" with live Claude agent
- [ ] B. Signed checkpoints and /verify page
- [ ] C. Backtest and shadow diff on /mandate
- [ ] D. Buyer-side purchases (buy -> price-match -> refund loop)
- [ ] E. Render deploy and Workflows
- [ ] F. AG Grid improvements

## STAGE 3: POLICY AND APPROVALS DEPTH
- [ ] G. Policy intelligence as pure functions
- [ ] H. Remote approvals (Telegram/Slack)

## STAGE 4: PRODUCT FINISH
- [ ] I. Complete UI redesign with screenshots
- [ ] J. Optional: SDK, APIMatic, benchmark

## STAGE 5: FINAL
- [ ] Rewrite README for judges
- [ ] DEVPOST_SUBMISSION.md and video shot list
- [ ] Final verification
- [ ] Delete WORKLOG.md

---
Last updated: 2026-11-07
