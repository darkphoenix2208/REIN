// Loads the already-created sandbox captures (.seed/captures.json) into the Rein DB. Makes NO PayPal calls and never re-seeds PayPal.
// The $200 demo order gets its five line items; other captures have no item data (item-scoped refunds on them are escalated).
import { readFileSync } from 'node:fs';
const path = process.env.REIN_DB ?? 'rein.db';
const caps = JSON.parse(readFileSync('.seed/captures.json', 'utf8'));
const { applySchema } = await import('../server/schema.ts');
const { openDb } = await import('../server/db.ts');
const d = await openDb(path);
applySchema(d);
// Items now come from PayPal Orders API (seed.mjs includes them in capture output)
for (const c of caps) {
  d.run(`INSERT OR IGNORE INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,?,?,?,?)`, c.txn_id, c.captured_cents, c.currency, 'sandbox:' + c.label, Date.parse(c.created));
  d.run(`INSERT OR IGNORE INTO orders(order_id,capture_id) VALUES (?,?)`, c.order_id, c.txn_id);
  // Insert items from PayPal if present
  if (c.items && Array.isArray(c.items)) {
    for (const item of c.items) {
      d.run(`INSERT OR IGNORE INTO order_items(order_id,item_id,name,unit_cents,qty) VALUES (?,?,?,?,?)`,
        c.order_id, item.item_id, item.name, item.unit_cents, item.qty);
    }
  }
}
console.log(`Seeded ${caps.length} captures into ${path}.`);
d.close();
