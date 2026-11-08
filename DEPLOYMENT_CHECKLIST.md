# Deployment Checklist

Use this checklist before deploying Rein to production.

---

## ✅ Pre-Deployment (Development)

### Code Quality
- [ ] All tests pass (`npm test`)
- [ ] Typecheck clean (`npm run typecheck`)
- [ ] No ESLint errors
- [ ] Git working tree clean
- [ ] All dependencies up to date (`npm audit`)

### Configuration
- [ ] Environment variables set (see `.env.example`)
- [ ] Database path configured
- [ ] Mandate limits reviewed and approved
- [ ] Webhook signature verification enabled
- [ ] Token budgets set for challenge mode

### Security
- [ ] Ed25519 keypair generated (`npm run keygen`)
- [ ] Private key secured (not in git, encrypted at rest)
- [ ] CORS configured for your domain
- [ ] Rate limiting enabled
- [ ] Secrets in environment variables (not hardcoded)

---

## ⚠️ Deployment (Staging)

### Infrastructure
- [ ] Database backup configured
- [ ] Logging enabled (stdout/stderr)
- [ ] Monitoring set up (metrics, traces, alerts)
- [ ] Health check endpoint tested (`/health`)
- [ ] Reverse proxy configured (nginx/caddy)
- [ ] SSL/TLS certificates installed

### PayPal Integration (If Using Live Mode)
- [ ] PayPal sandbox credentials tested
- [ ] Webhook signature verification working
- [ ] Webhook endpoint publicly accessible
- [ ] Webhook ID registered with PayPal
- [ ] Test refund executed successfully
- [ ] Test capture lookup working
- [ ] Test order details retrieval working

### AI Integration (If Using Challenge)
- [ ] Anthropic API key configured
- [ ] Token budgets enforced
- [ ] Challenge database isolated
- [ ] Challenge mandate locked
- [ ] Test run completed without runaway costs

### Notifications (If Using Telegram)
- [ ] Telegram bot created
- [ ] Bot token configured
- [ ] Chat ID identified
- [ ] Test notification sent
- [ ] Escalation flow tested

---

## 🚀 Production Deployment

### Final Checks
- [ ] All staging tests passed
- [ ] Load testing completed (100+ concurrent requests)
- [ ] Failover strategy documented
- [ ] Rollback plan ready
- [ ] On-call rotation scheduled
- [ ] Incident response runbook created

### Go-Live
- [ ] Database migrated
- [ ] Secrets rotated
- [ ] Logs aggregated (e.g., ELK, Datadog)
- [ ] Alerts configured (error rate, latency, cap exhaustion)
- [ ] Documentation updated with production URLs
- [ ] Team trained on ops procedures

### Post-Deployment
- [ ] Monitor error logs for 24 hours
- [ ] Verify first real refund executes correctly
- [ ] Check webhook deliveries
- [ ] Confirm notifications arrive
- [ ] Review ledger for unexpected entries
- [ ] Validate checkpoint signatures

---

## 📊 Monitoring Checklist

### Metrics to Track
- [ ] Request rate (requests/sec)
- [ ] Error rate (%)
- [ ] Latency (p50, p95, p99)
- [ ] Database query time
- [ ] Refund execution success rate
- [ ] Policy decision distribution (allowed/blocked/escalated)
- [ ] Daily cap usage (%)
- [ ] Webhook verification failures

### Alerts to Configure
- [ ] Error rate > 5%
- [ ] Latency p99 > 1s
- [ ] Database connection failures
- [ ] PayPal API errors
- [ ] Anthropic API quota exhausted
- [ ] Daily cap 80% consumed
- [ ] Ledger hash mismatch
- [ ] Checkpoint signature failure

---

## 🔒 Security Hardening

### Before Production
- [ ] Secrets manager configured (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] API authentication enabled (Bearer tokens)
- [ ] IP allowlist for admin endpoints
- [ ] CSRF protection enabled
- [ ] SQL injection prevention verified
- [ ] XSS protection enabled
- [ ] Content Security Policy configured
- [ ] Third-party security audit completed

### Compliance
- [ ] GDPR compliance reviewed (if applicable)
- [ ] PCI DSS compliance verified (if handling card data)
- [ ] SOC 2 controls implemented (if required)
- [ ] Data retention policy documented
- [ ] Privacy policy updated

---

## 📝 Documentation Checklist

### User-Facing
- [ ] API documentation published
- [ ] SDK examples provided
- [ ] Integration guide written
- [ ] Troubleshooting FAQ created
- [ ] Support contact documented

### Operations
- [ ] Runbook created (restart, scale, backup, restore)
- [ ] Incident response plan documented
- [ ] Escalation path defined
- [ ] Disaster recovery tested
- [ ] Change management process defined

---

## ⚠️ Known Limitations (Document These)

- [ ] Single-instance only (SQLite with BEGIN IMMEDIATE)
- [ ] No distributed consensus
- [ ] Live mode requires PayPal credentials
- [ ] Challenge requires Anthropic API key
- [ ] Notifications require Telegram bot
- [ ] UI visual verification pending (no Playwright screenshots yet)

---

## 🎯 Success Criteria

### Day 1
- [ ] Zero downtime
- [ ] All requests successful
- [ ] No error alerts
- [ ] Team confident in operations

### Week 1
- [ ] 99.9% uptime
- [ ] < 1% error rate
- [ ] p99 latency < 500ms
- [ ] No security incidents

### Month 1
- [ ] 99.95% uptime
- [ ] Zero over-refunds
- [ ] All escalations handled within SLA
- [ ] Positive user feedback

---

## 🚨 Rollback Plan

If anything goes wrong:

1. **Stop new traffic** (update load balancer)
2. **Revert to previous version** (docker image tag)
3. **Restore database backup** (if needed)
4. **Notify stakeholders** (email, Slack, PagerDuty)
5. **Post-mortem** (within 48 hours)

---

**Use this checklist systematically. Skip items at your own risk.** ⚠️
