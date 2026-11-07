// Seed challenge captures for Beat the Gate
import type { Db } from './db.ts';

export function createFreshChallengeCapture(db: Db): string {
  const id = `CHALLENGE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const orderId = `ORD-${id}`;
  const now = Date.now();

  db.run(
    'INSERT INTO payments (txn_id, captured_cents, refunded_cents, reserved_cents, currency, source, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    4500, // $45 order total (within $50 perActionCap so full-order rule R-ITEMS-ALL triggers)
    0,
    0,
    'USD',
    'challenge',
    now
  );

  db.run('INSERT INTO orders (order_id, capture_id) VALUES (?, ?)', orderId, id);

  db.run(
    `INSERT INTO order_items (order_id, item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag)
     VALUES (?, ?, ?, ?, ?, 0, 0, 1, null)`,
    orderId,
    'mug',
    'Coffee Mug',
    1800,
    1
  );

  db.run(
    `INSERT INTO order_items (order_id, item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag)
     VALUES (?, ?, ?, ?, ?, 0, 0, 1, null)`,
    orderId,
    'beans',
    'Artisan Coffee Beans',
    1500,
    1
  );

  db.run(
    `INSERT INTO order_items (order_id, item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag)
     VALUES (?, ?, ?, ?, ?, 0, 0, 1, null)`,
    orderId,
    'filter',
    'Pour-over Filters',
    1200,
    1
  );

  return id;
}

export function seedChallengeCaptures(db: Db): void {
  const captureId = 'CHALLENGE-CAPTURE-001';
  const orderId = 'CHALLENGE-ORDER-001';

  // Check if already seeded
  const existing = db.one('SELECT 1 FROM payments WHERE txn_id = ?', captureId);
  if (existing) return;

  const now = Date.now();

  // Insert payment
  db.run(
    'INSERT OR IGNORE INTO payments (txn_id, captured_cents, refunded_cents, reserved_cents, currency, source, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    captureId,
    1800, // $18 captured
    0,
    0,
    'USD',
    'challenge',
    now
  );

  // Insert order
  db.run(
    'INSERT OR IGNORE INTO orders (order_id, capture_id) VALUES (?, ?)',
    orderId,
    captureId
  );

  // Insert order item (coffee mug)
  db.run(
    `INSERT OR IGNORE INTO order_items (order_id, item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orderId,
    'mug',
    'Coffee Mug',
    1800,
    1,
    0,
    0,
    1,
    null
  );
}
