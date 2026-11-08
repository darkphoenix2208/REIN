# Rein - Quick Start Guide

Get Rein running in **5 minutes** (simulated mode, no credentials needed).

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Run Tests (Verify Everything Works)

```bash
# Run all 365 tests (both drivers)
DRIVER=better-sqlite3 npm test

# Or just the quick ones
DRIVER=better-sqlite3 npm test -- --test-name-pattern="simple"
```

**Expected:** ✅ All tests pass

---

## Step 3: Start the Server

```bash
npm start
```

**Expected:** Server running on `http://localhost:4317`

---

## Step 4: Explore the UI

Open `http://localhost:4317` in your browser and try:

### 🎯 Demo Page (/)
- Click "Run Demo" to see the gate in action
- See an AI agent request refunds
- Watch Rein block/allow/escalate based on policy

### 🛒 Shop Page (/shop)
- Create test orders
- Simulate customer refund requests
- See the gate enforce limits

### 🎮 Attack Lab (/attack-lab)
- Run 8 adversarial attack scenarios
- Verify the gate blocks ALL attacks
- See $0 over-refunded

### 📊 Ledger (/ledger)
- View hash-chained audit trail
- Export CSV
- Verify cryptographic signatures

### ⚡ Challenge (/challenge)
- "Beat the Gate" mode
- A separate AI agent tries to bypass limits
- Uses fake Anthropic client (no API key needed)

---

## Step 5: Try the SDK

### TypeScript Client

```typescript
import { ReinClient } from './sdk/rein-client';

const rein = new ReinClient('http://localhost:4317');

const result = await rein.check({
  tool: 'refund_items',
  captureId: 'CAP-123',
  items: [{ itemId: 'mug', qty: 1 }]
});

if (result.status === 'allowed') {
  // Execute the refund
}
```

### Python Client

```python
from sdk.rein_client import ReinClient

rein = ReinClient('http://localhost:4317')

result = rein.check(
    tool='refund_items',
    capture_id='CAP-123',
    items=[{'itemId': 'mug', 'qty': 1}]
)

if result['status'] == 'allowed':
    # Execute the refund
```

---

## Configuration (Optional)

### Environment Variables

```bash
# Database driver (default: better-sqlite3)
DRIVER=better-sqlite3

# Server port (default: 4317)
PORT=4317

# Mode (default: SIMULATED)
MODE=SIMULATED

# Live PayPal (requires credentials)
PAYPAL_CLIENT_ID=your-client-id
PAYPAL_SECRET=your-secret
MODE=LIVE

# Challenge agent (requires API key)
ANTHROPIC_API_KEY=your-key

# Telegram notifications (requires bot)
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Custom Mandate

Edit `server/mandate.ts` to set your limits:

```typescript
export const DEFAULT_MANDATE: Mandate = {
  perActionCapCents: 5000,      // $50 per refund
  hardMaxCents: 10000,          // $100 absolute limit
  dailyCapCents: 20000,         // $200 soft daily cap
  hardDailyCapCents: 50000,     // $500 hard daily cap
  expiresAt: Date.now() + 365 * 86400000, // 1 year
};
```

---

## Common Tasks

### Reset the Database

```bash
npm run reset
```

### Seed Test Data

```bash
npm run seed
```

### Run Typecheck

```bash
npm run typecheck
```

### Export Ledger

Visit `http://localhost:4317/ledger` and click "Export CSV"

### View API Docs

Open `docs/api/openapi.yaml` in Swagger Editor

---

## Troubleshooting

### "Port 4317 already in use"

```bash
# Kill existing process
lsof -ti:4317 | xargs kill -9

# Or use a different port
PORT=4318 npm start
```

### "SQLite database locked"

```bash
# Reset the database
npm run reset
```

### Tests failing

```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
npm test
```

---

## Next Steps

1. **Try Live Mode:** Set up PayPal sandbox credentials
2. **Beat the Gate:** Get Anthropic API key and run challenge
3. **Deploy:** Use the Dockerfile for production
4. **Integrate:** Wrap your AI agent's tools with `rein.wrap()`

---

## Support

- **Documentation:** See `docs/` folder
- **API Reference:** `docs/api/openapi.yaml`
- **Architecture:** `docs/Architecture/SYSTEM_ARCHITECTURE.md`
- **Threat Model:** `docs/Security/THREAT_MODEL.md`

---

**That's it!** Rein is now running in simulated mode. No credentials needed. 🎉
