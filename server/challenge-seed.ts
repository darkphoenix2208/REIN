// Seed challenge captures for Beat the Gate
import type { Db } from './db.ts';

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
