// Reserve-then-execute. check() is ONE BEGIN IMMEDIATE transaction: read window, read refundable balance, run the pure policy,
// reserve the amount (and item quantities) and append the ledger row. PayPal is called OUTSIDE the transaction.
// Live PayPal state (disputes, capture date) is read by the caller BEFORE check() and passed in as `ext`.
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { tx, type Db } from './db.ts';
import { decide, resolveItems, decidePayout, decideSubscriptionCancel, decideDisputeHandle, decidePurchase, type ItemRow, type PayoutPolicyState, type SubscriptionPolicyState, type DisputePolicyState, type PurchasePolicyState } from './policy.ts';
import { hashArgs, ledger, sha } from './ledger.ts';
import { sendTelegramApproval, getTelegramConfig } from './telegram.ts';
import { mandateHash, saveMandateVersion } from './mandate-version.ts';
import type { CheckInput, CheckResult, Decision, ExternalState, Mandate, PayRow } from './types.ts';

// statuses that SPEND the cap (blocked, denied, expired, failed and shadow do not)
const COUNTS = `('reserved','executed','approved_executed','unknown_outcome')`;
const DAY_MS = 86_400_000;

const payOf = (db: Db, cap: string): PayRow | undefined =>
  db.one<{ c: number; f: number; r: number; cur: string; capturedAt: number | null }>(
    'SELECT captured_cents c, refunded_cents f, reserved_cents r, currency cur, captured_at capturedAt FROM payments WHERE txn_id=?',
    cap,
  );

// rolling 24h total for REFUNDS only; EXCLUDES the action's own id (guard against double counting)
const windowSum = (db: Db, sid: string, now: number, exceptId: string): number =>
  db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND action_type='refund' AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, now - DAY_MS, exceptId) ?? 0;

const isDup = (db: Db, sid: string, cap: string, cents: number, now: number, exceptId: string, win = DAY_MS): boolean =>
  win > 0 &&
  !!db.one(`SELECT 1 FROM actions WHERE session_id=? AND capture_id=? AND amount_cents=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, cap, cents, now - win, exceptId);

const releaseItems = (db: Db, actionId: string, executed: boolean): void => {
  for (const it of db.all<{ order_id: string; item_id: string; qty: number }>('SELECT order_id, item_id, qty FROM action_items WHERE action_id=?', actionId)) {
    if (executed) db.run('UPDATE order_items SET reserved_qty=reserved_qty-?, refunded_qty=refunded_qty+? WHERE order_id=? AND item_id=?', it.qty, it.qty, it.order_id, it.item_id);
    else db.run('UPDATE order_items SET reserved_qty=reserved_qty-? WHERE order_id=? AND item_id=?', it.qty, it.order_id, it.item_id);
  }
};

export function checkPayout(db: Db, m: Mandate, a: CheckInput, now: number, mode: 'sim' | 'live'): CheckResult {
  const payeeEmail = a.payeeEmail!;
  const amountCents = a.amountCents!;

  // Calculate payout window sums
  const totalWindowSum = db.val<number>(
    `SELECT COALESCE(SUM(amount_cents),0) FROM actions
     WHERE tool='create_payout' AND created_at>=? AND id<>? AND status IN ${COUNTS}`,
    now - DAY_MS, a.actionId
  ) ?? 0;

  const payeeWindowSum = db.val<number>(
    `SELECT COALESCE(SUM(amount_cents),0) FROM actions
     WHERE tool='create_payout' AND payee_email=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`,
    payeeEmail, now - DAY_MS, a.actionId
  ) ?? 0;

  // Check if payee is new (never received before)
  const existingPayout = db.one(`SELECT 1 FROM actions WHERE tool='create_payout' AND payee_email=? AND status IN ${COUNTS} LIMIT 1`, payeeEmail);
  const isNewPayee = !existingPayout;

  // Check if payee is allowlisted
  const isAllowlisted = m.payoutAllowlist ? m.payoutAllowlist.includes(payeeEmail) : false;

  // Check for existing grant (bound to tool + payee + amount)
  const argsHash = hashArgs(a.tool, payeeEmail, amountCents, undefined);
  const grant = db.one<{ id: string }>('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);

  const state: PayoutPolicyState = {
    payeeWindowSum,
    totalWindowSum,
    isNewPayee,
    isAllowlisted,
    now,
    approved: !!grant,
  };

  const d = decidePayout(payeeEmail, amountCents, a.currency ?? 'USD', m, state);

  if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);

  return finishPayout(db, a, now, d, amountCents, payeeEmail, m, mode);
}

async function sendTelegramNotification(actionId: string, tool: string, amountCents: number, ruleId: string, reason: string, approvalUrl: string, sessionId: string, captureId?: string, payeeEmail?: string): Promise<void> {
  const telegramConfig = getTelegramConfig();
  if (!telegramConfig) return; // Telegram not configured, skip

  try {
    await sendTelegramApproval(telegramConfig, {
      actionId,
      amountCents,
      currency: 'USD',
      ruleId,
      reason,
      approvalUrl,
      sessionId,
      tool,
      captureId,
      payeeEmail,
    });
  } catch (error) {
    // Log error but don't fail the approval flow
    console.error('Telegram notification failed:', error);
  }
}

function finishPayout(db: Db, a: CheckInput, now: number, d: Decision, amountCents: number, payeeEmail: string, m: Mandate, mode: 'sim' | 'live'): CheckResult {
  const status = d.status === 'allowed' ? 'reserved' : d.status;
  const mHash = mandateHash(m);
  saveMandateVersion(db, m);
  const agentId = a.agentId ?? a.sessionId;

  db.run(
    'INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,payee_email,mandate_version,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    a.actionId, a.sessionId, a.tool, null, amountCents, d.status, d.ruleId, d.reason, status, now, now, 'payout', payeeEmail, mHash, agentId
  );

  ledger(db, a.actionId, 'decided', { decision: d.status, rule: d.ruleId, reason: d.reason, amountCents, payeeEmail, mode }, now, mHash, agentId);

  if (d.status === 'pending_approval') {
    const token = randomBytes(16).toString('hex');
    db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
    const approvalUrl = `${process.env.REIN_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`;

    // Send Telegram notification (async, non-blocking)
    sendTelegramNotification(a.actionId, a.tool, amountCents, d.ruleId, d.reason, approvalUrl, a.sessionId, undefined, payeeEmail).catch(() => {});

    return { status: 'pending_approval', ruleId: d.ruleId, reason: d.reason, actionId: a.actionId, approvalUrl, token };
  }

  return { status, ruleId: d.ruleId, reason: d.reason, actionId: a.actionId };
}

export function check(db: Db, m: Mandate, a: CheckInput, now = Date.now(), ext?: ExternalState, mode: 'sim' | 'live' = 'sim'): CheckResult {
  return tx(db, () => {
    const prior = db.one<{ status: string; ruleId: string; reason: string }>('SELECT status, rule_id ruleId, reason FROM actions WHERE id=?', a.actionId);
    if (prior) {
      // a hook retry gets the same answer
      const status = prior.status === 'reserved' ? 'allowed' : prior.status === 'pending_approval' ? 'pending_approval' : 'blocked';
      return { status, ruleId: prior.ruleId, reason: prior.reason, actionId: a.actionId };
    }

    // Handle payout actions separately
    if (a.tool === 'create_payout' && a.payeeEmail) {
      return checkPayout(db, m, a, now, mode);
    }

    const pay = a.captureId ? payOf(db, a.captureId) : undefined;

    // ---- item-scoped path: the amount comes from trusted order data resolved by CAPTURE ID (agent-supplied order ids are never used)
    let amountCents = a.amountCents;
    let itemLines: { itemId: string; name: string; qty: number; cents: number }[] | undefined;
    let orderId: string | undefined;
    let fullOrder = false;
    if (a.items) {
      const order = db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', a.captureId);
      if (!order) {
        return finish(db, a, now, { status: 'blocked', ruleId: 'R-ITEMS-UNKNOWN', reason: 'No order data is known for that payment, so items cannot be priced.' }, 0, undefined, undefined, m, mode);
      }
      orderId = order.order_id;
      // reserved_qty here also counts units already tied up in a PENDING approval for this order (not just 'reserved' actions),
      // so two concurrent requests for the same unit cannot both escalate (F1): the second sees it as unavailable.
      const rows = db.all<ItemRow>(
        `SELECT oi.item_id, oi.name, oi.unit_cents, oi.qty, oi.refunded_qty,
                oi.reserved_qty + COALESCE((SELECT SUM(ai.qty) FROM action_items ai JOIN actions a ON a.id = ai.action_id
                                             WHERE ai.order_id = oi.order_id AND ai.item_id = oi.item_id AND a.status = 'pending_approval'), 0) AS reserved_qty,
                oi.refundable, oi.flag
         FROM order_items oi WHERE oi.order_id=?`,
        orderId,
      );
      const res = resolveItems(rows, a.items);
      if (!res.ok) return finish(db, a, now, res.decision, 0, undefined, undefined, m, mode);
      amountCents = res.cents;
      itemLines = res.lines;
      fullOrder = res.fullOrder;
    }
    amountCents = amountCents ?? (pay ? pay.c - pay.f - pay.r : 0); // omitted amount = full remaining balance

    const argsHash = hashArgs(a.tool, a.captureId, amountCents, a.items);
    const grant = db.one<{ id: string }>('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);
    let d: Decision = decide({ amountCents, currency: a.currency }, m, {
      pay,
      windowSum: windowSum(db, a.sessionId, now, a.actionId),
      dup: a.captureId ? isDup(db, a.sessionId, a.captureId, amountCents, now, a.actionId, m.dupWindowMs) : false,
      now,
      approved: !!grant,
      ...(ext ? { ext } : {}),
    });
    // whole-order item refunds escalate (cumulative), unless already approved or the merchant turned the rule off
    if (d.status === 'allowed' && fullOrder && m.escalateFullOrder !== false && !grant)
      d = { status: 'pending_approval', ruleId: 'R-ITEMS-ALL', reason: 'This refund would take every item in the order, so a human must approve it.' };
    if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);
    return finish(db, a, now, d, amountCents, itemLines, orderId, m, mode);
  });
}

/** Persist the decision. SHADOW mode records the would-have decision and never reserves, escalates or blocks. */
function finish(db: Db, a: CheckInput, now: number, d: Decision, amountCents: number, lines: { itemId: string; name: string; qty: number; cents: number }[] | undefined, orderId: string | undefined, m: Mandate, mode: 'sim' | 'live'): CheckResult {
  const mHash = mandateHash(m);
  saveMandateVersion(db, m);
  const agentId = a.agentId ?? a.sessionId;
  if (m.shadow) {
    db.run('INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,mandate_version,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', a.actionId, a.sessionId, a.tool, a.captureId, amountCents, d.status, d.ruleId, d.reason, 'shadow', now, now, mHash, agentId);
    ledger(db, a.actionId, 'shadow', { mode, wouldHave: d.status, ruleId: d.ruleId, amountCents, captureId: a.captureId, items: lines }, now, mHash, agentId);
    return { status: 'allowed', ruleId: 'R-SHADOW', reason: 'Shadow mode: recorded only, nothing was enforced.', actionId: a.actionId, shadow: true, wouldHave: d };
  }
  const status = d.status === 'allowed' ? 'reserved' : d.status === 'blocked' ? 'blocked' : 'pending_approval';
  db.run('INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,mandate_version,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', a.actionId, a.sessionId, a.tool, a.captureId, amountCents, d.status, d.ruleId, d.reason, status, now, now, mHash, agentId);
  if (status === 'reserved') {
    db.run('UPDATE payments SET reserved_cents=reserved_cents+? WHERE txn_id=?', amountCents, a.captureId);
    if (lines && orderId)
      for (const l of lines) {
        db.run('UPDATE order_items SET reserved_qty=reserved_qty+? WHERE order_id=? AND item_id=?', l.qty, orderId, l.itemId);
        db.run('INSERT INTO action_items(action_id,order_id,item_id,qty) VALUES (?,?,?,?)', a.actionId, orderId, l.itemId, l.qty);
      }
  }
  let approvalUrl: string | undefined;
  let token: string | undefined;
  if (status === 'pending_approval') {
    token = randomBytes(16).toString('hex');
    db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
    if (lines && orderId) for (const l of lines) db.run('INSERT INTO action_items(action_id,order_id,item_id,qty) VALUES (?,?,?,?)', a.actionId, orderId, l.itemId, l.qty);
    approvalUrl = `${process.env.REIN_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`; // token in the fragment: never sent to servers or logs

    // Send Telegram notification (async, non-blocking)
    sendTelegramNotification(a.actionId, a.tool, amountCents, d.ruleId, d.reason, approvalUrl, a.sessionId, a.captureId).catch(() => {});
  }
  ledger(db, a.actionId, status, { mode, ruleId: d.ruleId, amountCents, captureId: a.captureId, items: lines }, now, mHash, agentId);
  return { ...d, actionId: a.actionId, ...(approvalUrl ? { approvalUrl } : {}), ...(token ? { token } : {}) };
}

export type Outcome = 'executed' | 'failed' | 'unknown';

/** PostToolUse / proxy result. Release the reservation ONLY on a clear failure; ambiguity keeps it held (conservative). */
export function result(db: Db, i: { actionId: string; outcome: Outcome; refundId?: string | undefined }, now = Date.now(), mode: 'sim' | 'live' = 'sim'): void {
  tx(db, () => {
    const row = db.one<{ status: string; amt: number; cap: string | null; atype: string }>('SELECT status, amount_cents amt, capture_id cap, action_type atype FROM actions WHERE id=?', i.actionId);
    if (!row || row.status !== 'reserved') return; // idempotent; blocked and escalated calls never executed
    
    // For refunds, update payments table and release items
    if (row.atype === 'refund' && row.cap) {
      if (i.outcome === 'executed') {
        db.run('UPDATE payments SET reserved_cents=reserved_cents-?, refunded_cents=refunded_cents+? WHERE txn_id=?', row.amt, row.amt, row.cap);
        releaseItems(db, i.actionId, true);
      }
      if (i.outcome === 'failed') {
        db.run('UPDATE payments SET reserved_cents=reserved_cents-? WHERE txn_id=?', row.amt, row.cap);
        releaseItems(db, i.actionId, false);
      }
    }
    
    const status = i.outcome === 'executed' ? 'executed' : i.outcome === 'failed' ? 'execution_failed' : 'unknown_outcome';
    db.run('UPDATE actions SET status=?, updated_at=? WHERE id=?', status, now, i.actionId);
    ledger(db, i.actionId, status, { mode, refundId: i.refundId ?? null }, now);
  });
}

/** Every 60 s: a result that never arrived becomes unknown_outcome. It still counts toward every cap and keeps its reservation. */
export function sweep(db: Db, now = Date.now()): void {
  tx(db, () => {
    for (const r of db.all<{ id: string }>(`SELECT id FROM actions WHERE status='reserved' AND updated_at < ?`, now - 120_000)) {
      db.run(`UPDATE actions SET status='unknown_outcome', updated_at=? WHERE id=?`, now, r.id);
      ledger(db, r.id, 'unknown_outcome', { reason: 'no result within 120s' }, now);
    }
    // an approval nobody ever clicked frees the items it held (F1): the pending-qty subquery in check() only counts status='pending_approval'
    for (const r of db.all<{ id: string }>(
      `SELECT a.id FROM actions a JOIN approvals ap ON ap.action_id = a.id WHERE a.status='pending_approval' AND ap.status='pending' AND ap.expires_at < ?`,
      now,
    )) {
      db.run(`UPDATE approvals SET status='expired' WHERE action_id=?`, r.id);
      db.run(`UPDATE actions SET status='expired', updated_at=? WHERE id=?`, now, r.id);
      ledger(db, r.id, 'expired', { reason: 'approval window elapsed unattended' }, now);
    }
  });
}

export type ApproveResult = { ok: true } | { ok: false; code: 403 | 404 | 409 | 410; why: string };

/** Approval executes NOTHING. It re-checks the hard rules against CURRENT state and mints a single-use 10-minute grant that the agent's retry consumes. */
export function approve(db: Db, m: Mandate, i: { actionId: string; token: string; decision: 'approve' | 'deny' }, now = Date.now(), ext?: ExternalState, mode: 'sim' | 'live' = 'sim'): ApproveResult {
  return tx(db, (): ApproveResult => {
    const row = db.one<any>(
      `SELECT a.session_id sid, a.tool, a.capture_id cap, a.amount_cents amt, a.status ast, a.payee_email payee, a.subscription_id sub, a.dispute_id dispute, ap.token_hash th, ap.expires_at exp, ap.status aps, a.action_type atype
       FROM approvals ap JOIN actions a ON a.id = ap.action_id WHERE ap.action_id = ?`,
      i.actionId,
    );
    if (!row) return { ok: false, code: 404, why: 'Unknown approval.' };
    const given = createHash('sha256').update(i.token).digest();
    const want = Buffer.from(row.th, 'hex');
    if (want.length !== given.length || !timingSafeEqual(given, want)) return { ok: false, code: 403, why: 'Invalid approval token.' };
    if (row.aps !== 'pending' || row.ast !== 'pending_approval') return { ok: false, code: 409, why: `Already ${row.aps}. Nothing more to do.` };
    if (now > row.exp) {
      db.run(`UPDATE approvals SET status='expired' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='expired', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'expired', { mode }, now);
      return { ok: false, code: 410, why: 'This approval expired. Nothing was refunded.' };
    }
    if (i.decision === 'deny') {
      db.run(`UPDATE approvals SET status='denied' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='denied', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'denied', { mode }, now);
      return { ok: true };
    }
    
    // For non-refund actions (payout, subscription, dispute), only check mandate expiry and mint grant
    const actionType = row.atype || 'refund';
    const items = db.all<{ item_id: string; qty: number }>('SELECT item_id, qty FROM action_items WHERE action_id=?', i.actionId).map((x) => ({ itemId: x.item_id, qty: x.qty }));
    
    // Check mandate expiry (always required)
    if (now > m.expiresAt) {
      db.run(`UPDATE approvals SET status='rejected' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='blocked', rule_id=?, reason=?, updated_at=? WHERE id=?`, 'R-MANDATE-EXPIRED', 'The mandate has expired.', now, i.actionId);
      ledger(db, i.actionId, 'approval_rejected', { mode, ruleId: 'R-MANDATE-EXPIRED' }, now);
      return { ok: false, code: 409, why: 'Mandate has expired.' };
    }
    
    // For refunds, re-check hard rules with approved flag
    if (actionType === 'refund') {
      const d = decide({ amountCents: row.amt }, m, {
        pay: payOf(db, row.cap),
        now,
        approved: true,
        windowSum: windowSum(db, row.sid, now, i.actionId),
        dup: isDup(db, row.sid, row.cap, row.amt, now, i.actionId, m.dupWindowMs),
        ...(ext ? { ext } : {}),
      });
      if (d.status !== 'allowed') {
        db.run(`UPDATE approvals SET status='rejected' WHERE action_id=?`, i.actionId);
        db.run(`UPDATE actions SET status='blocked', rule_id=?, reason=?, updated_at=? WHERE id=?`, d.ruleId, d.reason, now, i.actionId);
        ledger(db, i.actionId, 'approval_rejected', { mode, ruleId: d.ruleId }, now);
        return { ok: false, code: 409, why: `No longer valid: ${d.reason}` };
      }
    }
    
    // Bind grant to tool + target (payee/subscription/dispute/capture) + amount
    const target = row.payee || row.sub || row.dispute || row.cap || '';
    const grantHash = hashArgs(row.tool, target, row.amt, items.length ? items : undefined);
    
    db.run('INSERT INTO grants(id,args_hash,session_id,action_id,used,expires_at) VALUES (?,?,?,?,0,?)', randomUUID(), grantHash, row.sid, i.actionId, now + 600_000);
    db.run(`UPDATE approvals SET status='approved' WHERE action_id=?`, i.actionId);
    db.run(`UPDATE actions SET status='approved', updated_at=? WHERE id=?`, now, i.actionId);
    ledger(db, i.actionId, 'approved', { mode, ruleId: 'R-APPROVED' }, now);
    return { ok: true };
  });
}

/** Shadow-mode report: what Rein WOULD have stopped, in dollars, by rule. */
export function preventedLoss(db: Db): { wouldBlockCents: number; wouldEscalateCents: number; byRule: Record<string, number>; actions: number } {
  const rows = db.all<{ decision: string; rule_id: string; amount_cents: number }>(`SELECT decision, rule_id, amount_cents FROM actions WHERE status='shadow'`);
  const out = { wouldBlockCents: 0, wouldEscalateCents: 0, byRule: {} as Record<string, number>, actions: rows.length };
  for (const r of rows) {
    if (r.decision === 'blocked') out.wouldBlockCents += r.amount_cents;
    if (r.decision === 'pending_approval') out.wouldEscalateCents += r.amount_cents;
    if (r.decision !== 'allowed') out.byRule[r.rule_id] = (out.byRule[r.rule_id] ?? 0) + r.amount_cents;
  }
  return out;
}

export function checkSubscription(
  db: Db,
  m: Mandate,
  a: { actionId: string; sessionId: string; tool: string; subscriptionId: string; subscriptionStatus: string; subscriptionValue: number },
  now: number,
  mode: 'sim' | 'live'
): CheckResult {

  // Check for existing grant
  const argsHash = hashArgs(a.tool, a.subscriptionId, a.subscriptionValue, undefined);
  const grant = db.one<{ id: string }>('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);

  const state: SubscriptionPolicyState = {
    subscriptionStatus: a.subscriptionStatus,
    subscriptionValue: a.subscriptionValue,
    now,
    approved: !!grant,
  };

  const d = decideSubscriptionCancel(a.subscriptionId, m, state);

  if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);

  const mHash = mandateHash(m);
  saveMandateVersion(db, m);
  const agentId = (a as any).agentId ?? a.sessionId;

  return tx(db, () => {
    const status = d.status === 'allowed' ? 'reserved' : d.status;
    db.run(
      `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,subscription_id,mandate_version,agent_id)
       VALUES (?,?,?,NULL,?,?,?,?,?,?,?,'subscription',?,?,?)`,
      a.actionId, a.sessionId, a.tool, a.subscriptionValue, d.status, d.ruleId, d.reason, status, now, now, a.subscriptionId, mHash, agentId
    );

    let approvalUrl: string | undefined;
    let token: string | undefined;
    if (status === 'pending_approval') {
      token = randomBytes(16).toString('hex');
      db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
      approvalUrl = `${process.env.REIN_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`;
    }

    ledger(db, a.actionId, status, { mode, ruleId: d.ruleId, amountCents: a.subscriptionValue }, now, mHash, agentId);
    return { ...d, status, actionId: a.actionId, ...(approvalUrl ? { approvalUrl } : {}), ...(token ? { token } : {}) };
  });
}

export function checkDispute(
  db: Db,
  m: Mandate,
  a: { actionId: string; sessionId: string; tool: string; disputeId: string; disputeAction: string; disputeReason: string; disputeAmountCents: number; agentId?: string },
  now: number,
  mode: 'sim' | 'live'
): CheckResult {

  // Check for existing grant
  const argsHash = hashArgs(a.tool, a.disputeId, a.disputeAmountCents, undefined);
  const grant = db.one<{ id: string }>('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);

  const state: DisputePolicyState = {
    disputeReason: a.disputeReason,
    disputeAction: a.disputeAction as 'accept' | 'provide_evidence',
    disputeAmountCents: a.disputeAmountCents,
    now,
    approved: !!grant,
  };

  const d = decideDisputeHandle(a.disputeId, m, state);

  if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);

  const mHash = mandateHash(m);
  saveMandateVersion(db, m);
  const agentId = a.agentId ?? a.sessionId;

  return tx(db, () => {
    const status = d.status === 'allowed' ? 'reserved' : d.status;
    db.run(
      `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,dispute_id,mandate_version,agent_id)
       VALUES (?,?,?,NULL,?,?,?,?,?,?,?,'dispute',?,?,?)`,
      a.actionId, a.sessionId, a.tool, a.disputeAmountCents, d.status, d.ruleId, d.reason, status, now, now, a.disputeId, mHash, agentId
    );

    let approvalUrl: string | undefined;
    let token: string | undefined;
    if (status === 'pending_approval') {
      token = randomBytes(16).toString('hex');
      db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
      approvalUrl = `${process.env.REIN_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`;
    }

    ledger(db, a.actionId, status, { mode, ruleId: d.ruleId, amountCents: a.disputeAmountCents }, now, mHash, agentId);
    return { ...d, status, actionId: a.actionId, ...(approvalUrl ? { approvalUrl } : {}), ...(token ? { token } : {}) };
  });
}

export function checkPurchase(
  db: Db,
  m: Mandate,
  a: {
    actionId: string;
    sessionId: string;
    tool: string;
    productId: string;
    category?: string;
    amountCents: number;
    agentId?: string;
    lookupFailed?: boolean;
  },
  now: number,
  mode: 'sim' | 'live'
): CheckResult {
  const agentId = a.agentId ?? a.sessionId;
  const windowStart = now - DAY_MS;
  const spendRow = db.one<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM actions
     WHERE agent_id=? AND action_type='purchase' AND status IN ('allowed', 'executed', 'reserved') AND created_at > ?`,
    agentId,
    windowStart
  );
  const agentDailySpendCents = spendRow?.total ?? 0;

  const argsHash = hashArgs(a.tool, a.productId, a.amountCents, undefined);
  const grant = db.one<{ id: string }>(
    'SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?',
    argsHash,
    a.sessionId,
    now
  );

  const state: PurchasePolicyState = {
    amountCents: a.amountCents,
    agentDailySpendCents,
    productId: a.productId,
    productCategory: a.category,
    lookupFailed: a.lookupFailed,
    now,
    approved: !!grant,
  };

  const d = decidePurchase(a.productId, a.amountCents, a.category, m, state);

  if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);

  const mHash = mandateHash(m);
  saveMandateVersion(db, m);

  return tx(db, () => {
    const status = d.status;
    db.run(
      `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,mandate_version,agent_id)
       VALUES (?,?,?,NULL,?,?,?,?,?,?,?,'purchase',?,?)`,
      a.actionId,
      a.sessionId,
      a.tool,
      a.amountCents,
      status,
      d.ruleId,
      d.reason,
      status,
      now,
      now,
      mHash,
      agentId
    );

    let approvalUrl: string | undefined;
    let token: string | undefined;
    if (status === 'pending_approval') {
      token = randomBytes(16).toString('hex');
      db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
      approvalUrl = `${process.env.REIN_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`;
    }

    ledger(
      db,
      a.actionId,
      status,
      {
        mode,
        actionType: 'purchase',
        ruleId: d.ruleId,
        amountCents: a.amountCents,
        productId: a.productId,
        category: a.category,
      },
      now,
      mHash,
      agentId
    );
    return { ...d, actionId: a.actionId, ...(approvalUrl ? { approvalUrl } : {}), ...(token ? { token } : {}) };
  });
}
