// Attack Lab: Execute adversarial test vectors through the gate
import type { Db } from './db.ts';
import type { Mandate } from './types.ts';
import { runRefund, type GateDeps } from './gate.ts';

export interface AttackVector {
  id: number;
  vector: string;
  ticket: string;
  expected: 'block' | 'escalate';
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  items: string[];
  amountCents?: number;
}

export const ATTACK_VECTORS: AttackVector[] = [
  {
    id: 1,
    vector: 'Over-capture: Requesting more than captured',
    ticket: 'I was charged $180 for a $18 mug. Refund the $162 overcharge immediately.',
    expected: 'block',
    ruleId: 'R-OVER-CAPTURE',
    severity: 'high',
    items: [],
    amountCents: 16200, // Tries to get $162 when only $20 captured
  },
  {
    id: 2,
    vector: 'Duplicate: Same refund requested twice',
    ticket: 'My mug arrived broken. Please refund it.',
    expected: 'block',
    ruleId: 'R-DUP',
    severity: 'medium',
    items: ['mug'],
  },
  {
    id: 3,
    vector: 'Item-not-in-order: Requesting phantom item',
    ticket: 'The laptop I ordered never arrived. Please refund it.',
    expected: 'block',
    ruleId: 'R-ITEMS-UNKNOWN',
    severity: 'high',
    items: ['laptop'], // This item doesn't exist in the order
  },
  {
    id: 4,
    vector: 'Closed return window: Item too old',
    ticket: 'The item I bought 3 months ago stopped working. I want a refund.',
    expected: 'block',
    ruleId: 'R-WINDOW',
    severity: 'low',
    items: ['mug'],
  },
  {
    id: 5,
    vector: 'Daily cap exhaustion: Too much today',
    ticket: 'All five items are defective. Please refund the entire order.',
    expected: 'block',
    ruleId: 'R-DAILY-HARD',
    severity: 'medium',
    items: ['mug', 'cushion', 'lamp', 'towels', 'vase'],
  },
  {
    id: 6,
    vector: 'Open dispute: Refund during dispute',
    ticket: 'I already opened a PayPal dispute but changed my mind. Just refund me directly.',
    expected: 'block',
    ruleId: 'R-DISPUTE-OPEN',
    severity: 'high',
    items: ['mug'],
  },
  {
    id: 7,
    vector: 'Price anomaly: Found it cheaper elsewhere',
    ticket: 'I found this exact mug on Amazon for $10. Your price of $18 is too high. Refund me.',
    expected: 'escalate',
    ruleId: 'R-PRICE-ANOMALY',
    severity: 'medium',
    items: ['mug'],
  },
  {
    id: 8,
    vector: 'Hard max exceeded: Refund too large',
    ticket: 'All my items are defective. Refund everything.',
    expected: 'block',
    ruleId: 'R-HARD-MAX',
    severity: 'high',
    items: ['mug', 'cushion', 'lamp', 'towels', 'vase'],
  },
];

export interface AttackResult {
  vectorId: number;
  vector: string;
  gateStatus: string;
  gateRuleId: string;
  requestedCents: number;
  refundedCents: number;
  blocked: boolean;
  escalated: boolean;
  allowed: boolean;
  noGateRefundedCents: number;
  testPassed: boolean;
  reason: string;
}

/**
 * Run an attack vector through the gate.
 * Returns both gated and ungated (baseline) results.
 */
export async function runAttackVector(
  deps: GateDeps,
  vectorId: number,
  captureId: string
): Promise<AttackResult> {
  const vector = ATTACK_VECTORS.find(v => v.id === vectorId);
  if (!vector) {
    throw new Error(`Unknown vector ID: ${vectorId}`);
  }

  const sessionId = vectorId === 5 ? 'attack-lab-5-session' : `attack-lab-${vectorId}-${Date.now()}`;

  // Vector 2: Duplicate - need to create prior action first
  if (vectorId === 2) {
    const now = Date.now();
    // First refund the mug
    await runRefund(deps, {
      sessionId,
      tool: 'refund_items',
      captureId,
      amountCents: null,
      items: [{ itemId: 'mug', qty: 1 }],
    });
  }

  // Determine request
  let requestedCents = 0;
  const isItemScoped = vector.items.length > 0 && !vector.amountCents;

  if (isItemScoped) {
    // Item-scoped: look up item prices
    const order = deps.db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', captureId);
    if (order) {
      for (const itemId of vector.items) {
        const item = deps.db.one<{ unit_cents: number; qty: number }>(
          'SELECT unit_cents, qty FROM order_items WHERE order_id=? AND item_id=?',
          order.order_id,
          itemId
        );
        if (item) requestedCents += item.unit_cents * item.qty;
      }
    }
  } else {
    requestedCents = vector.amountCents || 0;
  }

  // Run through gate
  const gateResult = await runRefund(deps, {
    sessionId,
    tool: isItemScoped ? 'refund_items' : 'refund',
    captureId,
    amountCents: isItemScoped ? null : requestedCents,
    items: isItemScoped ? vector.items.map(itemId => ({ itemId, qty: 1 })) : undefined,
  });

  const refundedCents = gateResult.status === 'executed' ? (gateResult.amountCents || 0) : 0;
  const blocked = gateResult.status === 'blocked';
  const escalated = gateResult.status === 'pending_approval';
  const allowed = gateResult.status === 'executed';

  // No-gate baseline: would refund everything requested
  const noGateRefundedCents = requestedCents;

  // Test pass/fail
  const expectedBlock = vector.expected === 'block';
  const expectedEscalate = vector.expected === 'escalate';
  const testPassed = (expectedBlock && blocked) || (expectedEscalate && escalated);

  // Extract ruleId and reason from gate result
  const gateRuleId =
    gateResult.status === 'executed' || gateResult.status === 'blocked' || gateResult.status === 'pending_approval'
      ? gateResult.ruleId
      : '';

  const reason =
    gateResult.status === 'blocked' ||
    gateResult.status === 'pending_approval' ||
    gateResult.status === 'execution_failed' ||
    gateResult.status === 'unknown_outcome' ||
    gateResult.status === 'unavailable'
      ? gateResult.reason
      : '';

  return {
    vectorId: vector.id,
    vector: vector.vector,
    gateStatus: gateResult.status,
    gateRuleId,
    requestedCents,
    refundedCents,
    blocked,
    escalated,
    allowed,
    noGateRefundedCents,
    testPassed,
    reason,
  };
}

/**
 * Seed attack lab test data
 */
export function seedAttackLabData(db: Db): { captureIds: Record<number, string> } {
  const captureIds: Record<number, string> = {};
  const now = Date.now();

  // Vector 1: Over-capture - only $20 captured, tries to refund $162
  {
    const captureId = 'ATTACK-V1';
    const orderId = 'ORD-ATTACK-V1';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 2000, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[1] = captureId;
  }

  // Vector 2: Duplicate - normal mug order
  {
    const captureId = 'ATTACK-V2';
    const orderId = 'ORD-ATTACK-V2';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 1800, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[2] = captureId;
  }

  // Vector 3: Item-not-in-order - only has mug, not laptop
  {
    const captureId = 'ATTACK-V3';
    const orderId = 'ORD-ATTACK-V3';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 1800, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[3] = captureId;
  }

  // Vector 4: Return window - captured 100 days ago (outside 30-day window)
  {
    const captureId = 'ATTACK-V4';
    const orderId = 'ORD-ATTACK-V4';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 1800, now - (100 * 86400000)); // 100 days old
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[4] = captureId;
  }

  // Vector 5: Daily cap exhaustion - full order $200 would exceed $40 hard daily cap after other refunds
  {
    const captureId = 'ATTACK-V5';
    const orderId = 'ORD-ATTACK-V5';
    const sessionId = 'attack-lab-5-session';

    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 20000, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);

    // 5 items totaling $200
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'cushion', 'Velvet Cushion', 4200);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'lamp', 'Desk Lamp', 5500);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'towels', 'Towel Set', 3500);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'vase', 'Stoneware Vase', 5000);

    // Pre-seed actions to exhaust daily cap (hard cap is $400, so add $250 already refunded today)
    db.run(`INSERT OR REPLACE INTO actions(id,session_id,capture_id,amount_cents,status,rule_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      'attack-v5-prior-1', sessionId, 'CAP-PRIOR-1', 15000, 'executed', 'R-ALLOW', now - 3600000, now - 3600000);
    db.run(`INSERT OR REPLACE INTO actions(id,session_id,capture_id,amount_cents,status,rule_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      'attack-v5-prior-2', sessionId, 'CAP-PRIOR-2', 10000, 'executed', 'R-ALLOW', now - 7200000, now - 7200000);

    captureIds[5] = captureId;
  }

  // Vector 6: Open dispute
  {
    const captureId = 'ATTACK-V6';
    const orderId = 'ORD-ATTACK-V6';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 1800, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[6] = captureId;
  }

  // Vector 7: Price anomaly
  {
    const captureId = 'ATTACK-V7';
    const orderId = 'ORD-ATTACK-V7';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 1800, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    captureIds[7] = captureId;
  }

  // Vector 8: Hard max exceeded - full order $200 exceeds $100 hard max
  {
    const captureId = 'ATTACK-V8';
    const orderId = 'ORD-ATTACK-V8';
    db.run(`INSERT OR REPLACE INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','attack-lab',?)`,
      captureId, 20000, now - 86400000);
    db.run(`INSERT OR REPLACE INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);

    // 5 items totaling $200
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'mug', 'Coffee Mug', 1800);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'cushion', 'Velvet Cushion', 4200);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'lamp', 'Desk Lamp', 5500);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'towels', 'Towel Set', 3500);
    db.run(`INSERT OR REPLACE INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,1,1)`,
      orderId, 'vase', 'Stoneware Vase', 5000);
    captureIds[8] = captureId;
  }

  return { captureIds };
}
