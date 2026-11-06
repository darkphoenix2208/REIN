#!/usr/bin/env node
// npm run reseed: creates fresh sandbox captures within the 30-day return window
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAYPAL_BASE = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.');
  console.error('Set them in .env or pass as environment variables.');
  process.exit(1);
}

async function getAccessToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function createOrder(token, items) {
  const itemTotal = items.reduce((sum, i) => sum + parseFloat(i.unit_amount.value) * parseInt(i.quantity), 0).toFixed(2);
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: 'USD',
        value: itemTotal,
        breakdown: { item_total: { currency_code: 'USD', value: itemTotal } }
      },
      items
    }]
  };
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Order creation failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.id;
}

async function captureOrder(token, orderId) {
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Capture failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (!captureId) throw new Error('No capture ID in response');
  return { orderId, captureId, captured: data.purchase_units[0].payments.captures[0].amount.value };
}

const SAMPLE_ITEMS = {
  apparel: [
    { name: 'Cotton T-Shirt', sku: 'tshirt-001', unit_amount: { currency_code: 'USD', value: '18.00' }, quantity: '1' },
    { name: 'Denim Jeans', sku: 'jeans-002', unit_amount: { currency_code: 'USD', value: '45.00' }, quantity: '1' },
    { name: 'Running Shoes', sku: 'shoes-003', unit_amount: { currency_code: 'USD', value: '65.00' }, quantity: '1' },
  ],
  coffee: [
    { name: 'Espresso Blend', sku: 'coffee-espresso', unit_amount: { currency_code: 'USD', value: '12.00' }, quantity: '2' },
    { name: 'Cold Brew', sku: 'coffee-coldbrew', unit_amount: { currency_code: 'USD', value: '8.00' }, quantity: '1' },
  ],
  home: [
    { name: 'Throw Pillow', sku: 'home-pillow', unit_amount: { currency_code: 'USD', value: '25.00' }, quantity: '2' },
    { name: 'Table Lamp', sku: 'home-lamp', unit_amount: { currency_code: 'USD', value: '40.00' }, quantity: '1' },
    { name: 'Cotton Towels (set)', sku: 'home-towels', unit_amount: { currency_code: 'USD', value: '30.00' }, quantity: '1' },
  ],
};

async function main() {
  console.log('Reseeding PayPal sandbox with fresh captures...');
  const token = await getAccessToken();
  console.log('✓ Got access token');

  const results = [];
  for (const [name, items] of Object.entries(SAMPLE_ITEMS)) {
    try {
      const orderId = await createOrder(token, items);
      console.log(`✓ Created order ${orderId} (${name})`);
      const { captureId, captured } = await captureOrder(token, orderId);
      console.log(`✓ Captured $${captured} → ${captureId}`);
      results.push({ name, orderId, captureId, amount: captured });
    } catch (e) {
      console.error(`✗ Failed to create ${name}:`, e.message);
    }
  }

  console.log('\n📋 Summary:');
  for (const r of results) {
    console.log(`  ${r.name.padEnd(10)} | Order: ${r.orderId} | Capture: ${r.captureId} | $${r.amount}`);
  }
  console.log('\n💡 Update .seed/ or scripts/seed-db.mjs with these fresh capture IDs.');
  console.log('   These captures are valid for ~30 days from creation.');
}

main().catch(e => {
  console.error('Reseed failed:', e);
  process.exit(1);
});
