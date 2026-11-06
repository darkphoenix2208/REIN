// Seeds captured SANDBOX payments so refunds have something real to hit. Usage: node scripts/seed.mjs
// Reads .env (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL, optional SEED_CARD_*). Never prints credentials.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; })) : {};
const get = (k, d = '') => process.env[k] || env[k] || d;
const BASE = get('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
const ID = get('PAYPAL_CLIENT_ID'), SECRET = get('PAYPAL_CLIENT_SECRET');
if (!/sandbox/.test(BASE)) throw new Error('Refusing to run against a non-sandbox URL.');
if (!ID || !SECRET) throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env (sandbox).');
// PayPal's documented public sandbox test card (developer.paypal.com/api/rest/sandbox/card-testing) is the default.
const CARD = { number: get('SEED_CARD_NUMBER', '4012888888881881'), expiry: get('SEED_CARD_EXPIRY', '2030-12'), security_code: get('SEED_CARD_CVV', '123') };
const N = Number(process.argv[2] ?? 12);
const AMOUNTS = ['60.00', '120.00', '60.00', '200.00', '45.00', '75.00', '90.00', '150.00', '35.00', '80.00', '110.00', '55.00', '65.00', '95.00', '130.00', '40.00', '70.00', '85.00', '100.00', '50.00'];
const LABELS = { 0: 'pool', 1: 'demo-escalate-$75-of-$120', 2: 'demo-allow-$18-of-$60', 3: 'demo-injection-full-$200-vs-$18' };   // PayPal itself rejects refunds above the capture, so the attack is a FULL refund of a $200 capture when $18 was legitimate
const toCents = (v) => { const [i, f = ''] = v.split('.'); return Number(i) * 100 + Number(f.padEnd(2, '0')); };

const tr = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
if (!tr.ok) throw new Error(`Token request failed: HTTP ${tr.status}`);
const tok = (await tr.json()).access_token;

// Line items for different scenarios
const ITEM_SETS = [
  [{ name: 'Coffee Mug', sku: 'mug', unit_amount: { currency_code: 'USD', value: '18.00' }, quantity: '1', category: 'PHYSICAL_GOODS' }], // $18 single item
  [{ name: 'Throw Pillow', sku: 'cushion', unit_amount: { currency_code: 'USD', value: '25.00' }, quantity: '2', category: 'PHYSICAL_GOODS' },
   { name: 'Table Lamp', sku: 'lamp', unit_amount: { currency_code: 'USD', value: '40.00' }, quantity: '1', category: 'PHYSICAL_GOODS' },
   { name: 'Cotton Towels', sku: 'towels', unit_amount: { currency_code: 'USD', value: '30.00' }, quantity: '1', category: 'PHYSICAL_GOODS' }], // $120 multi-item
  [{ name: 'Ceramic Vase', sku: 'vase', unit_amount: { currency_code: 'USD', value: '45.00' }, quantity: '1', category: 'PHYSICAL_GOODS' }], // $45
  [{ name: 'Wool Blanket', sku: 'blanket', unit_amount: { currency_code: 'USD', value: '80.00' }, quantity: '1', category: 'PHYSICAL_GOODS' },
   { name: 'Picture Frame', sku: 'frame', unit_amount: { currency_code: 'USD', value: '35.00' }, quantity: '2', category: 'PHYSICAL_GOODS' },
   { name: 'Candle Set', sku: 'candles', unit_amount: { currency_code: 'USD', value: '25.00' }, quantity: '2', category: 'PHYSICAL_GOODS' }], // $200 injection target
];

const runId = Date.now(), out = [];
for (let i = 0; i < N; i++) {
  const items = ITEM_SETS[i % ITEM_SETS.length];
  const itemTotal = items.reduce((sum, it) => sum + parseFloat(it.unit_amount.value) * parseInt(it.quantity), 0).toFixed(2);
  const r = await fetch(`${BASE}/v2/checkout/orders`, { method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation', 'PayPal-Request-Id': `rein-seed-${runId}-${i}` },
    body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: `seed-${i}`,
      amount: { currency_code: 'USD', value: itemTotal, breakdown: { item_total: { currency_code: 'USD', value: itemTotal } } },
      items }],
      payment_source: { card: { ...CARD, name: 'Test Buyer', billing_address: { address_line_1: '123 Main St', admin_area_2: 'San Jose', admin_area_1: 'CA', postal_code: '95131', country_code: 'US' } } } }) });
  const j = await r.json().catch(() => ({})); const cap = j?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!r.ok || j.status !== 'COMPLETED' || !cap?.id) {
    console.error(`seed ${i} FAILED: HTTP ${r.status} status=${j?.status} debug_id=${r.headers.get('paypal-debug-id')} ${JSON.stringify((j?.details ?? [j?.message]).slice?.(0, 2) ?? j?.message)}`);
    break;
  }
  out.push({ txn_id: cap.id, order_id: j.id, captured_cents: toCents(cap.amount.value), currency: cap.amount.currency_code, label: LABELS[i] ?? 'pool', created: new Date().toISOString(), items: items.map(it => ({ item_id: it.sku, name: it.name, unit_cents: toCents(it.unit_amount.value), qty: parseInt(it.quantity) })) });
  console.log(`seeded ${cap.id}  ${cap.amount.currency_code} ${cap.amount.value}  ${items.length} items  ${LABELS[i] ?? ''}`);
  await new Promise((res) => setTimeout(res, 400));
}
mkdirSync('.seed', { recursive: true }); writeFileSync('.seed/captures.json', JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} captures to .seed/captures.json (gitignored)`);
