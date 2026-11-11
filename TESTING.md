# 🧪 Testing Guide

Complete testing guide for the Rein project.

## 📋 Table of Contents

- [Quick Test](#quick-test)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [UI Testing](#ui-testing)
- [API Testing](#api-testing)
- [Security Testing](#security-testing)
- [Performance Testing](#performance-testing)

---

## ⚡ Quick Test (2 Minutes)

Verify everything works:

```bash
# Run all tests
npm test

# Should show:
# ✓ 374 tests passing
# ✓ 0 tests failing
```

---

## 🔬 Unit Tests

### Run All Tests
```bash
npm test
```

### Test Specific Driver
```bash
# Test with better-sqlite3 (default)
npm test

# Test with node:sqlite
npm run test:node-sqlite
```

### TypeScript Type Checking
```bash
npm run typecheck
```

### What's Tested

| Category | Tests | Coverage |
|----------|-------|----------|
| **Core Gate** | 100+ | Item/amount refunds, duplicates, windows |
| **Policy Engine** | 50+ | Mandate validation, rule matching |
| **Ledger** | 40+ | Hash chain, tamper detection |
| **PayPal Integration** | 30+ | API calls, webhook verification |
| **Security** | 20+ | Token validation, signature checks |
| **Concurrency** | 10+ | Atomic operations, race conditions |
| **Edge Cases** | 80+ | Invalid inputs, boundary conditions |
| **Attack Vectors** | 8 | All adversarial scenarios |

**Total: 374 tests**

---

## 🔗 Integration Tests

### Test Full Refund Flow

1. **Setup test environment:**
```bash
npm run reset  # Reset database
npm run reseed # Seed test data
```

2. **Start server:**
```bash
npm run demo
```

3. **Test refund via API:**
```bash
curl -X POST http://127.0.0.1:4317/v1/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -d '{
    "captureId": "test-capture-1",
    "sessionId": "test-session",
    "items": [{"itemId": "item-1", "qty": 1}]
  }'
```

### Test Attack Lab

Visit http://127.0.0.1:4317/attack-lab and run all 8 attack vectors:

1. **Over-capture** - Should block (R-OVER-CAPTURE)
2. **Duplicate** - Should block (R-DUP)
3. **Phantom item** - Should block (R-ITEMS-UNKNOWN)
4. **Closed window** - Should block (R-WINDOW)
5. **Daily cap** - Should block (R-DAILY-HARD)
6. **Open dispute** - Should block (R-DISPUTE-OPEN)
7. **Price anomaly** - Should escalate (R-PRICE-ANOMALY)
8. **Hard max** - Should block (R-HARD-MAX)

**Expected:** $0 over-refunded across all vectors ✅

---

## 🖥️ UI Testing

### Manual Testing Checklist

Test all 11 pages:

#### 1. Demo Page (`/`)
- [ ] Both lanes (with/without gate) render
- [ ] Attack scenarios show correct results
- [ ] Mode indicator shows LIVE or SIMULATED

#### 2. Ledger Page (`/ledger`)
- [ ] AG Grid loads with data
- [ ] Filtering works on all columns
- [ ] Sorting works
- [ ] CSV export downloads
- [ ] Total row shows correct sums

#### 3. Ops Dashboard (`/ops`)
- [ ] Metrics load and update
- [ ] Exposure shows spent/cap/blocked
- [ ] Chain verification status shows
- [ ] Auto-refreshes every 5s

#### 4. Attack Lab (`/attack-lab`)
- [ ] All 8 vectors can be run
- [ ] Results show correct blocking/escalation
- [ ] Summary shows $0 over-refunded

#### 5. Challenge Page (`/challenge`)
- [ ] Loads without errors
- [ ] Shows live/recorded mode indicator
- [ ] Leaderboard displays

#### 6. Verify Page (`/verify`)
- [ ] Can export checkpoint
- [ ] Verification UI works
- [ ] Ed25519 signature validation works

#### 7. Author Page (`/author`)
- [ ] Policy samples load
- [ ] Compilation status shows

#### 8. Mandate Page (`/mandate`)
- [ ] Current mandate displays
- [ ] Rules are readable

#### 9. Proof Page (`/proof`)
- [ ] Proof generation works

#### 10. Approval Page (`/approve/:id`)
- [ ] Loads with action ID
- [ ] Approve/deny buttons work

#### 11. Shop Page (`/shop`)
- [ ] Products display
- [ ] Price matching info shows

### Automated UI Tests (Playwright)

```bash
# Install Playwright
npx playwright install chromium

# Run screenshot tests
npm run screenshots
```

Screenshots saved to: `docs/assets/screenshots/ui-check/`

---

## 🔌 API Testing

### Health Checks

```bash
# Basic health
curl https://rein-xgze.onrender.com/health
# Expected: {"ok":true,"mode":"live"}

# Detailed health
curl https://rein-xgze.onrender.com/healthz
# Expected: {"status":"ok","uptime":...,"mode":"live"}

# Readiness
curl https://rein-xgze.onrender.com/readyz
# Expected: {"ready":true}
```

### Ledger API

```bash
# Get ledger (limit 10)
curl https://rein-xgze.onrender.com/v1/ledger?limit=10

# Get ledger export (full chain)
curl https://rein-xgze.onrender.com/v1/ledger/export

# Get checkpoint
curl https://rein-xgze.onrender.com/v1/ledger/checkpoint

# Verify checkpoint
curl https://rein-xgze.onrender.com/v1/ledger/verify
```

### Exposure API

```bash
# Get current exposure
curl https://rein-xgze.onrender.com/v1/exposure
# Expected: {"spentCents":0,"hardDailyCapCents":40000,...}
```

### Authenticated Endpoints

Require `Authorization: Bearer $REIN_TOKEN` header:

```bash
# Check refund (dry run)
curl -X POST https://rein-xgze.onrender.com/v1/check \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "test-1",
    "sessionId": "session-1",
    "tool": "refund",
    "captureId": "capture-1",
    "amountCents": 1000
  }'

# Execute refund
curl -X POST https://rein-xgze.onrender.com/v1/refund \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "captureId": "capture-1",
    "sessionId": "session-1",
    "amount": "10.00"
  }'
```

### Webhook Endpoint

```bash
# Test webhook (requires PayPal signature)
curl -X POST https://rein-xgze.onrender.com/v1/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "PAYMENT.CAPTURE.COMPLETED",
    "resource": {...}
  }'
```

---

## 🔒 Security Testing

### 1. Authentication Tests

```bash
# Test without token (should fail 401)
curl -X POST https://rein-xgze.onrender.com/v1/check \
  -H "Content-Type: application/json"
# Expected: 401 Unauthorized

# Test with wrong token (should fail 401)
curl -X POST https://rein-xgze.onrender.com/v1/check \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json"
# Expected: 401 Unauthorized
```

### 2. Input Validation

Test invalid inputs:

```bash
# Invalid amount
curl -X POST http://127.0.0.1:4317/v1/check \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountCents": "invalid"}'
# Expected: 400 Bad Request

# Missing required fields
curl -X POST http://127.0.0.1:4317/v1/check \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 Bad Request
```

### 3. Rate Limiting

Test rate limits (if configured):

```bash
# Send rapid requests
for i in {1..100}; do
  curl https://rein-xgze.onrender.com/health
done
```

### 4. Webhook Signature Verification

```bash
# Test unsigned webhook (should fail)
curl -X POST http://127.0.0.1:4317/v1/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{"event_type":"test"}'
# Expected: Rejected (no valid signature)
```

### 5. SQL Injection Tests

The project uses parameterized queries, but verify:

```bash
curl -X POST http://127.0.0.1:4317/v1/check \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actionId": "test; DROP TABLE ledger;--"}'
# Expected: Handled safely, no SQL injection
```

### 6. Ledger Tamper Detection

Manually edit database and verify:

```bash
# Run doctor to check integrity
npm run doctor
# Should detect any chain breaks
```

---

## ⚡ Performance Testing

### Benchmark Gate Throughput

```bash
npm run benchmark
```

**Expected results:**
- **Throughput:** ~5000+ ops/sec
- **Latency p50:** <1ms
- **Latency p99:** <2ms

### Load Testing

Use Apache Bench or similar:

```bash
# Install ab
# sudo apt-get install apache2-utils

# Test health endpoint
ab -n 1000 -c 10 https://rein-xgze.onrender.com/health

# Test with authentication
ab -n 100 -c 5 -H "Authorization: Bearer $REIN_TOKEN" \
  https://rein-xgze.onrender.com/v1/exposure
```

### Database Performance

```bash
# Check database size
ls -lh rein.db

# Verify query performance
npm run ledger-head
```

---

## 📊 Test Results

### Current Status

```
✅ Unit Tests: 374 passing, 0 failing
✅ Both SQLite Drivers: better-sqlite3 ✓, node:sqlite ✓
✅ TypeScript: No type errors
✅ Security: 0 npm vulnerabilities
✅ Attack Lab: $0 over-refunded
✅ Concurrent Safety: 8 simultaneous refunds handled
✅ Hash Chain: Tamper detection working
✅ Deployment: Live at https://rein-xgze.onrender.com
```

### Coverage

| Component | Coverage |
|-----------|----------|
| Core Gate | 100% |
| Policy Engine | 100% |
| Ledger | 100% |
| PayPal Client | 95% (live API not tested) |
| HTTP Endpoints | 100% |
| UI Components | 85% (manual testing) |

---

## 🐛 Debugging Tests

### Run Tests in Watch Mode

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --test --watch "tests/**/*.test.ts"
```

### Run Single Test File

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --test tests/gate.test.ts
```

### Enable Verbose Output

```bash
npm test -- --test-reporter=tap
```

### Debug Test Failures

1. Check error message and stack trace
2. Verify test data setup
3. Check database state
4. Review recent code changes
5. Run single test file to isolate issue

---

## 📝 Writing New Tests

### Test Template

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';

test('your test description', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  // Test logic here
  const result = yourFunction();
  
  assert.equal(result, expectedValue);
  
  db.close();
});
```

### Best Practices

- ✅ Use `:memory:` database for tests
- ✅ Clean up resources (close DB)
- ✅ Test both success and error cases
- ✅ Use descriptive test names
- ✅ Keep tests independent
- ✅ Mock external APIs (PayPal)

---

## 🆘 Troubleshooting

### Tests Fail Locally But Pass in CI
- Check Node.js version (need 22+)
- Verify all dependencies installed
- Clear node_modules and reinstall

### Database Locked Errors
- Close all database connections
- Delete test databases
- Use `:memory:` for tests

### Timeout Errors
- Increase test timeout (default: 60s)
- Check for hanging async operations
- Verify mocks are working

---

**All tests passing? You're ready to deploy! 🚀**
