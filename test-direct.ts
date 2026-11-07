import { openDb } from './server/db.ts';
import { applySchema } from './server/schema.ts';
import { createApp } from './server/app.ts';
import { loadMandate } from './server/config.ts';

process.env.ED25519_PRIVATE_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';

const db = await openDb(':memory:');
applySchema(db);
const mandate = loadMandate('mandate.json');
const app = createApp({ db, mandate, paypal: null, publicUrl: 'http://test' }, { production: false });

const server = app.listen(5555, () => {
  console.log('Test server running on http://127.0.0.1:5555');
});

// Give it a moment then test
setTimeout(async () => {
  try {
    console.log('\n=== Testing routes ===\n');

    const res1 = await fetch('http://127.0.0.1:5555/v1/ledger/checkpoint');
    console.log('1. GET /v1/ledger/checkpoint:', res1.status, await res1.json());

    const res2 = await fetch('http://127.0.0.1:5555/v1/ledger/verify');
    console.log('2. GET /v1/ledger/verify:', res2.status, await res2.json());

    const res3 = await fetch('http://127.0.0.1:5555/v1/challenge/leaderboard');
    console.log('3. GET /v1/challenge/leaderboard:', res3.status, await res3.json());

    const res4 = await fetch('http://127.0.0.1:5555/v1/challenge/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Test' })
    });
    console.log('4. POST /v1/challenge/attempt:', res4.status, await res4.json());

  } catch (e) {
    console.error('Fetch error:', e);
  } finally {
    server.close();
    process.exit(0);
  }
}, 1000);
