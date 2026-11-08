# Rein SDK

Client libraries for the Rein API in multiple languages.

## TypeScript/JavaScript

```typescript
import { createClient } from './rein-client.ts';

const client = createClient({
  baseUrl: 'http://localhost:4317',
  bearerToken: 'your-token-here', // Optional, for authenticated endpoints
});

// Public endpoints
const checkResult = await client.check({
  tool: 'refund_items',
  payload: {
    capture_id: 'CAP123',
    items: [{ name: 'Coffee Mug', quantity: 1 }],
    reason: 'Item damaged'
  }
});

const ledger = await client.getLedger(100);
const checkpoint = await client.getCheckpoint();

// Authenticated endpoints (requires bearerToken)
const mandate = await client.getMandate();
const backtestResult = await client.backtest({ perActionCapCents: 5000 });
```

## Python

```python
from rein_client import ReinClient

client = ReinClient(
    base_url='http://localhost:4317',
    bearer_token='your-token-here'  # Optional
)

# Public endpoints
check_result = client.check({
    'tool': 'refund_items',
    'payload': {
        'capture_id': 'CAP123',
        'items': [{'name': 'Coffee Mug', 'quantity': 1}],
        'reason': 'Item damaged'
    }
})

ledger = client.get_ledger(limit=100)
checkpoint = client.get_checkpoint()
```

## Installation

### TypeScript/JavaScript

```bash
# Copy rein-client.ts to your project
cp sdk/rein-client.ts your-project/lib/
```

### Python

```bash
# Copy rein_client.py to your project
cp sdk/rein_client.py your-project/
```

## API Reference

See `docs/api/openapi.yaml` for the full OpenAPI 3.1 specification.

### Key Endpoints

- `POST /v1/check` - Gate check (public)
- `GET /v1/ledger` - Query audit ledger (public)
- `GET /v1/ledger/checkpoint` - Get signed checkpoint (public)
- `POST /v1/ledger/verify` - Verify checkpoint signature (public)
- `POST /v1/result` - Approve/deny action (authenticated)
- `GET /v1/mandate` - Get current mandate (authenticated)
- `POST /v1/mandate/backtest` - Backtest mandate changes (authenticated)

## Error Handling

All SDK methods throw/reject on HTTP errors:

```typescript
try {
  const result = await client.check(request);
} catch (error) {
  console.error('Gate check failed:', error.message);
}
```

## Configuration

### Base URL

Default: `http://localhost:4317`

Set via constructor:
```typescript
const client = createClient({ baseUrl: 'https://your-rein-instance.com' });
```

### Bearer Token

Required for authenticated endpoints (`/v1/result`, `/v1/mandate`, `/v1/ops`, `/v1/exposure`).

Set via constructor:
```typescript
const client = createClient({
  baseUrl: 'http://localhost:4317',
  bearerToken: process.env.REIN_BEARER_TOKEN
});
```

### Timeout

Default: 30 seconds

```typescript
const client = createClient({
  baseUrl: 'http://localhost:4317',
  timeout: 60000 // 60 seconds
});
```

## License

MIT
