# Customer Velocity Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-customer refund frequency and amounts over rolling 24-hour windows to prevent abuse.

**Architecture:** Add velocity tracking layer to the existing gate system. Query ledger for customer actions in rolling windows, enforce configurable limits per customer, escalate when approaching limits, block when exceeded.

**Tech Stack:** TypeScript, SQLite (existing), existing ledger schema

**Spec:** [IMPROVEMENTS.md](../../../IMPROVEMENTS.md#1-customer-velocity-tracking-)

## Global Constraints

- Node.js >= 22.6
- TypeScript 5.9+ strict mode
- SQLite (better-sqlite3 and node:sqlite dual support)
- All amounts in cents (integer)
- Zero tolerance for SQL injection (parameterized queries only)
- Fail-closed: errors block, never allow
- All times in Unix milliseconds
- Deterministic: no AI decides money

## Review Focus

1. **Customer ID spoofing**: Different customer IDs for same person should not bypass limits. Current implementation accepts any `customerId` string from caller - validation/normalization should happen at gate entry, not in velocity check.
2. **Window edge cases**: Actions exactly at window boundary (e.g., 24h 0ms ago) should be included/excluded consistently. Test with `now - 86400000` timestamps.
3. **Amount overflow**: Summing large refund amounts could overflow JavaScript Number.MAX_SAFE_INTEGER. Use integer arithmetic, check totals don't exceed 2^53-1.
4. **Concurrent requests from same customer**: Two simultaneous requests should both see correct current total, not race. Existing transaction isolation handles this via atomic reservations.
5. **Rule precedence**: If both action limit and amount limit triggered, which message shows? Should be most restrictive rule first, with clear error message.

---

## File Structure

**New Files:**
- `server/velocity.ts` - Velocity tracking logic
- `tests/velocity.test.ts` - Velocity tests

**Modified Files:**
- `server/types.ts` - Add VelocityRule, VelocityCheck types
- `server/config.ts` - Add velocity rules to Mandate
- `server/dispatch.ts` - Integrate velocity check into check()
- `web/src/Ops.tsx` - Add velocity metrics to dashboard

---

### Task 1: Velocity Types and Schema

**Files:**
- Modify: `server/types.ts:1-50`
- Test: `tests/velocity.test.ts`

**Interfaces:**
- Consumes: Existing `Mandate` type
- Produces: 
  - `VelocityRule` type: `{ maxActions: number; maxAmountCents: number; windowHours: number }`
  - `VelocityCheck` result: `'allowed' | 'approaching' | 'exceeded'`

- [ ] **Step 1: Write type definitions in `server/types.ts`**

Add after existing types:
```typescript
export interface VelocityRule {
  maxActions: number;           // Maximum refund actions per customer per window
  maxAmountCents: number;       // Maximum total refund amount per customer per window
  windowHours: number;          // Rolling window size in hours (typically 24)
}

export interface VelocityCheck {
  customerId: string;
  windowMs: number;             // Window size in milliseconds
  currentActions: number;       // Actions in current window
  currentAmountCents: number;   // Total amount in current window
  maxActions: number;
  maxAmountCents: number;
  status: 'allowed' | 'approaching' | 'exceeded';
  message?: string;
}
```

- [ ] **Step 2: Add velocity rule to Mandate interface**

In `server/types.ts`, extend `Mandate` interface:
```typescript
export interface Mandate {
  // ... existing fields ...
  velocityRule?: VelocityRule;  // Optional: per-customer velocity limits
}
```

- [ ] **Step 3: Update mandate schema in `server/config.ts`**

Import `z` from zod, add after existing rules:
```typescript
const velocityRuleSchema = z.object({
  maxActions: z.number().int().positive(),
  maxAmountCents: z.number().int().positive(),
  windowHours: z.number().positive().default(24)
}).optional();

// Add to mandateSchema:
velocityRule: velocityRuleSchema
```

- [ ] **Step 4: Commit**

```bash
git add server/types.ts server/config.ts
git commit -m "feat(velocity): add velocity tracking types and mandate schema"
```

---

### Task 2: Velocity Query Logic

**Files:**
- Create: `server/velocity.ts`
- Test: `tests/velocity.test.ts`

**Interfaces:**
- Consumes: `Db` from `db.ts`, `VelocityRule` from `types.ts`
- Produces: `checkVelocity(db: Db, customerId: string, amountCents: number, rule: VelocityRule, nowMs: number): VelocityCheck`

- [ ] **Step 1: Write failing test for velocity within limits**

Create `tests/velocity.test.ts`:
```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { checkVelocity } from '../server/velocity.ts';

test('velocity check: within limits', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const rule = { maxActions: 3, maxAmountCents: 50000, windowHours: 24 };
  const result = checkVelocity(db, 'customer-1', 1000, rule, Date.now());
  
  assert.equal(result.status, 'allowed');
  assert.equal(result.currentActions, 0);
  assert.equal(result.currentAmountCents, 0);
  
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/velocity.test.ts`
Expected: FAIL with "Cannot find module '../server/velocity.ts'"

- [ ] **Step 3: Implement `checkVelocity` in `server/velocity.ts`**

```typescript
import type { Db } from './db.ts';
import type { VelocityRule, VelocityCheck } from './types.ts';

export function checkVelocity(
  db: Db,
  customerId: string,
  amountCents: number,
  rule: VelocityRule,
  nowMs: number
): VelocityCheck {
  const windowMs = rule.windowHours * 60 * 60 * 1000;
  const windowStartMs = nowMs - windowMs;
  
  // Query ledger for customer's executed actions in window
  const stmt = db.prepare(`
    SELECT COUNT(*) as actions, COALESCE(SUM(amount_cents), 0) as total
    FROM ledger
    WHERE payload_json LIKE ?
      AND created_at >= ?
      AND event IN ('executed', 'approved_executed')
  `);
  
  const row = stmt.get(`%"customerId":"${customerId}"%`, windowStartMs) as { actions: number; total: number };
  
  const currentActions = row.actions;
  const currentAmountCents = row.total;
  const projectedActions = currentActions + 1;
  const projectedAmount = currentAmountCents + amountCents;
  
  // Check if limits would be exceeded
  if (projectedActions > rule.maxActions) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'exceeded',
      message: `Customer has ${currentActions} refunds in last ${rule.windowHours}h, max is ${rule.maxActions}`
    };
  }
  
  if (projectedAmount > rule.maxAmountCents) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'exceeded',
      message: `Customer has $${(currentAmountCents / 100).toFixed(2)} refunded in last ${rule.windowHours}h, max is $${(rule.maxAmountCents / 100).toFixed(2)}`
    };
  }
  
  // Check if approaching limits (>80%)
  const actionThreshold = rule.maxActions * 0.8;
  const amountThreshold = rule.maxAmountCents * 0.8;
  
  if (projectedActions >= actionThreshold || projectedAmount >= amountThreshold) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'approaching',
      message: `Customer approaching velocity limits: ${currentActions}/${rule.maxActions} actions, $${(currentAmountCents / 100).toFixed(2)}/$${(rule.maxAmountCents / 100).toFixed(2)}`
    };
  }
  
  return {
    customerId,
    windowMs,
    currentActions,
    currentAmountCents,
    maxActions: rule.maxActions,
    maxAmountCents: rule.maxAmountCents,
    status: 'allowed'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/velocity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/velocity.ts tests/velocity.test.ts
git commit -m "feat(velocity): implement velocity check query logic"
```

---

### Task 3: Velocity Limit Tests

**Files:**
- Test: `tests/velocity.test.ts`

**Interfaces:**
- Consumes: `checkVelocity` from Task 2
- Produces: Comprehensive test coverage

- [ ] **Step 1: Write test for action limit exceeded**

Add to `tests/velocity.test.ts`:
```typescript
test('velocity check: action limit exceeded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 100000, windowHours: 24 };
  
  // Insert 2 executed actions in ledger within window
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`).run(nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 1000 }));
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`).run(nowMs - 2000, JSON.stringify({ customerId: 'customer-1', amountCents: 2000 }));
  
  const result = checkVelocity(db, 'customer-1', 500, rule, nowMs);
  
  assert.equal(result.status, 'exceeded');
  assert.equal(result.currentActions, 2);
  assert.match(result.message!, /has 2 refunds/);
  
  db.close();
});
```

- [ ] **Step 2: Write test for amount limit exceeded**

```typescript
test('velocity check: amount limit exceeded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const nowMs = Date.now();
  const rule = { maxActions: 10, maxAmountCents: 10000, windowHours: 24 };
  
  // Insert action with $90 within window
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`).run(nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 9000 }));
  
  // Try to add $20 more (would exceed $100 limit)
  const result = checkVelocity(db, 'customer-1', 2000, rule, nowMs);
  
  assert.equal(result.status, 'exceeded');
  assert.equal(result.currentAmountCents, 9000);
  assert.match(result.message!, /\$90\.00.*\$100\.00/);
  
  db.close();
});
```

- [ ] **Step 3: Write test for approaching threshold**

```typescript
test('velocity check: approaching limits', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const nowMs = Date.now();
  const rule = { maxActions: 5, maxAmountCents: 50000, windowHours: 24 };
  
  // Insert 3 actions (60% of limit)
  for (let i = 1; i <= 3; i++) {
    db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
      VALUES (?, ?, 'executed', ?, ?, ?)`).run(i, nowMs - i * 1000, `hash${i}`, i === 1 ? '0' : `hash${i-1}`, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));
  }
  
  // This would be 4th action (80% of 5) - should trigger approaching
  const result = checkVelocity(db, 'customer-1', 5000, rule, nowMs);
  
  assert.equal(result.status, 'approaching');
  assert.equal(result.currentActions, 3);
  assert.match(result.message!, /approaching velocity limits/);
  
  db.close();
});
```

- [ ] **Step 4: Write test for window boundary**

```typescript
test('velocity check: window boundary - old actions excluded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 10000, windowHours: 24 };
  const windowMs = 24 * 60 * 60 * 1000;
  
  // Insert action just outside window (24h 1ms ago) - should NOT count
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`).run(nowMs - windowMs - 1, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));
  
  // Insert action just inside window (24h 0ms ago) - should count
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`).run(nowMs - windowMs, JSON.stringify({ customerId: 'customer-1', amountCents: 3000 }));
  
  const result = checkVelocity(db, 'customer-1', 1000, rule, nowMs);
  
  assert.equal(result.currentActions, 1); // Only the second action counts
  assert.equal(result.currentAmountCents, 3000);
  assert.equal(result.status, 'allowed');
  
  db.close();
});
```

- [ ] **Step 5: Write test for customer isolation**

```typescript
test('velocity check: different customers isolated', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 10000, windowHours: 24 };
  
  // Customer 1 has 2 actions
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`).run(nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`).run(nowMs - 2000, JSON.stringify({ customerId: 'customer-1', amountCents: 4000 }));
  
  // Customer 2 checks velocity - should see 0 actions
  const result = checkVelocity(db, 'customer-2', 1000, rule, nowMs);
  
  assert.equal(result.currentActions, 0);
  assert.equal(result.currentAmountCents, 0);
  assert.equal(result.status, 'allowed');
  
  db.close();
});
```

- [ ] **Step 6: Run all velocity tests**

Run: `npm test -- tests/velocity.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add tests/velocity.test.ts
git commit -m "test(velocity): add comprehensive velocity check tests"
```

---

### Task 4: Integrate Velocity Check into Gate

**Files:**
- Modify: `server/dispatch.ts:1-100`
- Modify: `server/types.ts:100-150`
- Test: `tests/gate.test.ts`

**Interfaces:**
- Consumes: `checkVelocity` from `velocity.ts`, `CheckInput` from `types.ts`
- Produces: Velocity-aware `check()` function, new rule IDs `R-VELOCITY-ACTIONS`, `R-VELOCITY-AMOUNT`

- [ ] **Step 1: Add customerId to CheckInput type**

In `server/types.ts`, modify `CheckInput`:
```typescript
export interface CheckInput {
  // ... existing fields ...
  customerId?: string;  // Optional: for velocity tracking
}
```

- [ ] **Step 2: Write failing integration test**

Add to `tests/gate.test.ts`:
```typescript
test('gate: block refund when velocity limit exceeded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const mandate: Mandate = {
    version: 1,
    hardDailyCapCents: 100000,
    velocityRule: { maxActions: 2, maxAmountCents: 10000, windowHours: 24 }
  };
  
  const nowMs = Date.now();
  
  // Record 2 refunds for this customer
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`).run(nowMs - 1000, JSON.stringify({ customerId: 'cust-1', amountCents: 5000, actionId: 'act-1' }));
  db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`).run(nowMs - 2000, JSON.stringify({ customerId: 'cust-1', amountCents: 4000, actionId: 'act-2' }));
  
  // Try 3rd refund - should be blocked
  const result = check(db, mandate, {
    actionId: 'act-3',
    sessionId: 'sess-1',
    tool: 'refund',
    captureId: 'cap-1',
    amountCents: 1000,
    customerId: 'cust-1'
  }, nowMs, undefined, 'live');
  
  assert.equal(result.allowed, false);
  assert.equal(result.ruleId, 'R-VELOCITY-ACTIONS');
  assert.match(result.reason!, /velocity.*2 refunds/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/gate.test.ts -g "velocity limit"`
Expected: FAIL (velocity check not integrated yet)

- [ ] **Step 4: Integrate velocity check in `server/dispatch.ts`**

In `check()` function, add after existing checks, before daily cap:
```typescript
import { checkVelocity } from './velocity.ts';

// In check() function:
// ... existing checks ...

// Velocity check
if (mandate.velocityRule && i.customerId) {
  const velocity = checkVelocity(d, i.customerId, amountCents, mandate.velocityRule, now);
  
  if (velocity.status === 'exceeded') {
    const ruleId = velocity.currentActions > velocity.maxActions ? 'R-VELOCITY-ACTIONS' : 'R-VELOCITY-AMOUNT';
    return deny(ruleId, velocity.message!);
  }
  
  if (velocity.status === 'approaching') {
    // Escalate for human review when approaching limits
    return escalate('R-VELOCITY-APPROACHING', velocity.message!, i.sessionId);
  }
}

// ... rest of checks ...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/gate.test.ts -g "velocity limit"`
Expected: PASS

- [ ] **Step 6: Add test for velocity escalation**

```typescript
test('gate: escalate when approaching velocity limit', async () => {
  const db = await openDb(':memory:');
  applySchema(db);
  
  const mandate: Mandate = {
    version: 1,
    hardDailyCapCents: 100000,
    velocityRule: { maxActions: 5, maxAmountCents: 50000, windowHours: 24 }
  };
  
  const nowMs = Date.now();
  
  // Record 3 refunds (4th would be 80% of 5)
  for (let i = 1; i <= 3; i++) {
    db.prepare(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
      VALUES (?, ?, 'executed', ?, ?, ?)`).run(i, nowMs - i * 1000, `hash${i}`, i === 1 ? '0' : `hash${i-1}`, JSON.stringify({ customerId: 'cust-1', amountCents: 5000, actionId: `act-${i}` }));
  }
  
  const result = check(db, mandate, {
    actionId: 'act-4',
    sessionId: 'sess-1',
    tool: 'refund',
    captureId: 'cap-1',
    amountCents: 5000,
    customerId: 'cust-1'
  }, nowMs, undefined, 'live');
  
  assert.equal(result.allowed, false);
  assert.equal(result.escalated, true);
  assert.equal(result.ruleId, 'R-VELOCITY-APPROACHING');
});
```

- [ ] **Step 7: Run all gate tests**

Run: `npm test -- tests/gate.test.ts`
Expected: All tests PASS including new velocity tests

- [ ] **Step 8: Commit**

```bash
git add server/dispatch.ts server/types.ts tests/gate.test.ts
git commit -m "feat(velocity): integrate velocity check into gate dispatch"
```

---

### Task 5: Velocity Metrics in Ops Dashboard

**Files:**
- Modify: `web/src/Ops.tsx:1-100`
- Modify: `server/app.ts:100-150`

**Interfaces:**
- Consumes: `/v1/exposure` endpoint
- Produces: Velocity metrics display in Ops dashboard

- [ ] **Step 1: Add velocity metrics to exposure API**

In `server/app.ts`, modify `/v1/exposure` endpoint to include velocity data:
```typescript
api.get('/exposure', (req, res) => {
  // ... existing exposure calculation ...
  
  // Add velocity metrics if rule exists
  let velocityMetrics = undefined;
  if (d.mandate.velocityRule) {
    // Get top customers by recent activity
    const topCustomers = d.db.prepare(`
      SELECT 
        json_extract(payload_json, '$.customerId') as customerId,
        COUNT(*) as actions,
        SUM(amount_cents) as total
      FROM ledger
      WHERE created_at >= ?
        AND event IN ('executed', 'approved_executed')
        AND json_extract(payload_json, '$.customerId') IS NOT NULL
      GROUP BY customerId
      ORDER BY total DESC
      LIMIT 10
    `).all(Date.now() - (d.mandate.velocityRule.windowHours * 60 * 60 * 1000)) as Array<{ customerId: string; actions: number; total: number }>;
    
    velocityMetrics = {
      rule: d.mandate.velocityRule,
      topCustomers: topCustomers.map(c => ({
        customerId: c.customerId,
        actions: c.actions,
        amountCents: c.total,
        utilizationPct: Math.max(
          (c.actions / d.mandate.velocityRule!.maxActions) * 100,
          (c.total / d.mandate.velocityRule!.maxAmountCents) * 100
        )
      }))
    };
  }
  
  res.json({ ...existingExposure, velocity: velocityMetrics });
});
```

- [ ] **Step 2: Update Ops dashboard to display velocity metrics**

In `web/src/Ops.tsx`, add after exposure section:
```typescript
{metrics.velocity && (
  <div className="card">
    <h3>Velocity Tracking</h3>
    <div className="metrics-grid">
      <div className="metric">
        <div className="label">Max Actions / {metrics.velocity.rule.windowHours}h</div>
        <div className="value">{metrics.velocity.rule.maxActions}</div>
      </div>
      <div className="metric">
        <div className="label">Max Amount / {metrics.velocity.rule.windowHours}h</div>
        <div className="value">{usd(metrics.velocity.rule.maxAmountCents)}</div>
      </div>
    </div>
    
    {metrics.velocity.topCustomers.length > 0 && (
      <>
        <h4>Top Customers (Last {metrics.velocity.rule.windowHours}h)</h4>
        <table className="velocity-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Actions</th>
              <th>Amount</th>
              <th>Utilization</th>
            </tr>
          </thead>
          <tbody>
            {metrics.velocity.topCustomers.map((c: any) => (
              <tr key={c.customerId} className={c.utilizationPct >= 80 ? 'warning' : ''}>
                <td><code>{c.customerId}</code></td>
                <td>{c.actions} / {metrics.velocity.rule.maxActions}</td>
                <td>{usd(c.amountCents)} / {usd(metrics.velocity.rule.maxAmountCents)}</td>
                <td>{c.utilizationPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Add CSS for velocity table**

In `web/src/styles.css`:
```css
.velocity-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.velocity-table th {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 2px solid var(--border-color);
}

.velocity-table td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.velocity-table tr.warning {
  background-color: rgba(255, 165, 0, 0.1);
}

.velocity-table code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.9em;
}
```

- [ ] **Step 4: Test manually**

1. Start server: `npm run demo`
2. Add velocity rule to `mandate.json`:
   ```json
   {
     "version": 1,
     "hardDailyCapCents": 40000,
     "velocityRule": {
       "maxActions": 5,
       "maxAmountCents": 10000,
       "windowHours": 24
     }
   }
   ```
3. Visit http://localhost:4317/ops
4. Verify velocity section appears
5. Process some refunds with customerId
6. Refresh ops page, verify customers appear in table

- [ ] **Step 5: Commit**

```bash
git add server/app.ts web/src/Ops.tsx web/src/styles.css
git commit -m "feat(velocity): add velocity metrics to ops dashboard"
```

---

### Task 6: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `API.md`
- Create: `docs/velocity-tracking.md`

**Interfaces:**
- Consumes: All implemented velocity features
- Produces: Complete documentation

- [ ] **Step 1: Add velocity tracking to README features**

In `README.md`, update "What Works (Verified)" section:
```markdown
### Core Gate ✅
- **374+ passing tests** on both SQLite drivers
- Item-scoped refunds with quantity tracking and per-item rules
- Amount-scoped refunds with configurable caps
- **Customer velocity tracking** - per-customer rate limits over rolling windows
- Duplicate detection within rolling 24h window
- ... (rest of features)
```

- [ ] **Step 2: Create velocity tracking documentation**

Create `docs/velocity-tracking.md`:
```markdown
# Customer Velocity Tracking

Prevent abuse by tracking per-customer refund frequency and amounts.

## Overview

Velocity tracking enforces per-customer limits over rolling time windows:
- **Action limits**: Maximum number of refunds per customer per window
- **Amount limits**: Maximum total refund amount per customer per window
- **Configurable windows**: Typically 24 hours, fully configurable

## Configuration

Add to `mandate.json`:

\`\`\`json
{
  "version": 1,
  "hardDailyCapCents": 40000,
  "velocityRule": {
    "maxActions": 5,
    "maxAmountCents": 10000,
    "windowHours": 24
  }
}
\`\`\`

## Behavior

- **Allowed**: Customer within limits, refund proceeds
- **Approaching** (≥80% of limit): Escalates for human review
- **Exceeded**: Blocks refund, returns error

## Rule IDs

- `R-VELOCITY-ACTIONS`: Too many refunds
- `R-VELOCITY-AMOUNT`: Too much money refunded
- `R-VELOCITY-APPROACHING`: Close to limits (escalation)

## Monitoring

The Ops Dashboard (`/ops`) shows:
- Current velocity rule settings
- Top customers by recent activity
- Utilization percentages
- Warning indicators for customers approaching limits

## Testing

Velocity tracking respects customer isolation - different customers are tracked separately.

## Customer ID

The `customerId` field must be provided in refund requests:

\`\`\`bash
curl -X POST /v1/refund \\
  -H "Authorization: Bearer $REIN_TOKEN" \\
  -d '{
    "captureId": "cap-123",
    "sessionId": "sess-456",
    "customerId": "customer@example.com",
    "amount": "10.00"
  }'
\`\`\`

If `customerId` is not provided, velocity tracking is skipped (backwards compatible).
```

- [ ] **Step 3: Update API.md with velocity endpoints**

In `API.md`, update `/v1/refund` endpoint documentation:
```markdown
### `POST /v1/refund`

**Request:**
\`\`\`json
{
  "captureId": "capture-789",
  "sessionId": "session-456",
  "customerId": "customer@example.com",  // Optional: for velocity tracking
  "amount": "10.00"
}
\`\`\`

...

**Response (Blocked - Velocity):**
\`\`\`json
{
  "allowed": false,
  "reason": "Customer has 5 refunds in last 24h, max is 5",
  "ruleId": "R-VELOCITY-ACTIONS"
}
\`\`\`
```

- [ ] **Step 4: Commit**

```bash
git add README.md API.md docs/velocity-tracking.md
git commit -m "docs(velocity): add velocity tracking documentation"
```

---

## Implementation Notes

**Dependencies between tasks:**
- Task 1 (Types) must complete before Task 2 (Logic)
- Task 2 (Logic) must complete before Task 3 (Tests) and Task 4 (Integration)
- Task 4 (Integration) must complete before Task 5 (UI)
- Task 6 (Docs) can run anytime after Task 4

**Testing strategy:**
- Unit tests for velocity logic (Task 3)
- Integration tests with gate (Task 4)
- Manual UI testing (Task 5)

**Performance considerations:**
- Current query scans ledger with LIKE on JSON field - acceptable for SQLite with thousands of rows
- For PostgreSQL migration, add indexed JSONB column for customerId
- Monitor query performance in ops dashboard

**Backwards compatibility:**
- `customerId` field is optional
- Velocity rule is optional in mandate
- Existing code continues to work without changes

---

**Plan complete!** This is the first of six improvement plans. Would you like me to continue with the next plan (Two-Person Approval), or would you prefer to review and implement this one first?
