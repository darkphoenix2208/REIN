# 🔌 API Reference

Complete API documentation for Rein.

**Base URL (Production):** `https://rein-xgze.onrender.com`  
**Base URL (Local):** `http://127.0.0.1:4317`

---

## 📋 Table of Contents

- [Authentication](#authentication)
- [Public Endpoints](#public-endpoints)
- [Authenticated Endpoints](#authenticated-endpoints)
- [Ledger Endpoints](#ledger-endpoints)
- [Webhook Endpoints](#webhook-endpoints)
- [Error Responses](#error-responses)

---

## 🔐 Authentication

Most endpoints require a Bearer token:

```bash
Authorization: Bearer <REIN_TOKEN>
```

Set `REIN_TOKEN` in your environment variables.

---

## 🌐 Public Endpoints

No authentication required.

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "ok": true,
  "mode": "live"  // or "sim"
}
```

### `GET /healthz`

Kubernetes-style health check.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "mode": "live"
}
```

### `GET /readyz`

Readiness check.

**Response:**
```json
{
  "ready": true,
  "db": "ok",
  "mode": "live"
}
```

---

## 🔒 Authenticated Endpoints

Require `Authorization: Bearer <REIN_TOKEN>` header.

### `POST /v1/check`

Dry-run refund check without executing.

**Request:**
```json
{
  "actionId": "action-123",
  "sessionId": "session-456",
  "tool": "refund",  // or "refund_items"
  "captureId": "capture-789",
  "amountCents": 1000,  // or null for full refund
  "currency": "USD"  // optional
}
```

**Response (Allowed):**
```json
{
  "allowed": true,
  "amountCents": 1000,
  "actionId": "action-123",
  "reservationId": "res-abc"
}
```

**Response (Blocked):**
```json
{
  "allowed": false,
  "reason": "R-OVER-CAPTURE",
  "message": "Refund exceeds captured amount",
  "actionId": "action-123"
}
```

**Response (Escalated):**
```json
{
  "allowed": false,
  "escalated": true,
  "reason": "R-PRICE-ANOMALY",
  "message": "Price anomaly detected",
  "approvalUrl": "https://rein-xgze.onrender.com/approve/action-123",
  "actionId": "action-123"
}
```

### `POST /v1/refund`

Execute refund.

**Request (Amount-based):**
```json
{
  "captureId": "capture-789",
  "sessionId": "session-456",
  "amount": "10.00"  // string with 2 decimals
}
```

**Request (Item-based):**
```json
{
  "captureId": "capture-789",
  "sessionId": "session-456",
  "items": [
    {"itemId": "item-1", "qty": 2},
    {"itemId": "item-2", "qty": 1}
  ]
}
```

**Response (Success):**
```json
{
  "ok": true,
  "refundId": "refund-xyz",
  "amountCents": 1000,
  "actionId": "action-123"
}
```

### `POST /v1/result`

Report refund execution outcome.

**Request:**
```json
{
  "actionId": "action-123",
  "outcome": "executed",  // or "failed", "unknown"
  "refundId": "refund-xyz"  // optional
}
```

**Response:**
```json
{
  "ok": true
}
```

### `POST /v1/approve`

Approve or deny escalated action.

**Request:**
```json
{
  "actionId": "action-123",
  "token": "approval-token-from-url",
  "decision": "approve"  // or "deny"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "decision": "approve",
  "actionId": "action-123"
}
```

**Response (Error):**
```json
{
  "ok": false,
  "code": 401,
  "error": "invalid_token",
  "message": "Invalid approval token"
}
```

### `POST /v1/order/:captureId`

Get order items for a capture.

**Response:**
```json
{
  "items": [
    {
      "itemId": "item-1",
      "name": "Product Name",
      "priceCents": 2500,
      "qty": 2
    }
  ],
  "totalCents": 5000
}
```

### `POST /v1/attack-lab/run`

Run attack vector from Attack Lab.

**Request:**
```json
{
  "vector": 1  // 1-8
}
```

**Response:**
```json
{
  "ok": true,
  "vector": 1,
  "name": "Over-capture",
  "result": "blocked",
  "reason": "R-OVER-CAPTURE",
  "attemptedCents": 16200,
  "blockedCents": 16200
}
```

---

## 📊 Ledger Endpoints

### `GET /v1/ledger`

Get ledger entries.

**Query Parameters:**
- `limit` - Number of entries to return (default: 100, max: 1000)
- `offset` - Offset for pagination (default: 0)

**Response:**
```json
{
  "rows": [
    {
      "seq": 1,
      "created_at": 1234567890000,
      "event": "reserved",
      "rule_id": "R-ITEM",
      "amount_cents": 1000,
      "action_id": "action-123",
      "hash": "abc123...",
      "prev_hash": "000000..."
    }
  ],
  "total": 42,
  "chain": {
    "ok": true,
    "rows": 42,
    "head": "abc123..."
  },
  "mode": "LIVE-FIRE"
}
```

### `GET /v1/ledger/export`

Export full ledger with all fields for verification.

**Response:**
```json
{
  "rows": [
    {
      "seq": 1,
      "created_at": 1234567890000,
      "event": "reserved",
      "hash": "abc123...",
      "prev_hash": "000000...",
      "payload_json": "{...}"
    }
  ],
  "total": 42,
  "mode": "LIVE-FIRE"
}
```

### `GET /v1/ledger/checkpoint`

Create signed Ed25519 checkpoint.

**Query Parameters:**
- `format` - Response format: `json` (default) or `text`

**Response (JSON):**
```json
{
  "checkpoint": {
    "seq": 42,
    "head": "abc123...",
    "timestamp": 1234567890000,
    "signature": "def456...",
    "pubkey": "ghi789..."
  }
}
```

### `POST /v1/ledger/checkpoint`

Verify submitted checkpoint.

**Request:**
```json
{
  "seq": 42,
  "head": "abc123...",
  "timestamp": 1234567890000,
  "signature": "def456...",
  "pubkey": "ghi789..."
}
```

**Response:**
```json
{
  "valid": true,
  "seq": 42,
  "head": "abc123..."
}
```

### `GET /v1/ledger/verify`

Get verification page HTML.

### `GET /v1/ledger/pubkey`

Get Ed25519 public key.

**Response:**
```json
{
  "pubkey": "ghi789..."
}
```

### `GET /v1/ledger/evidence-pack`

Download evidence pack for disputes.

**Query Parameters:**
- `format` - `pdf` or `json`
- `captureId` - Filter by capture ID

**Response:** File download

---

## 🔗 Exposure Endpoints

### `GET /v1/exposure`

Get current spending exposure.

**Response:**
```json
{
  "spentCents": 5000,
  "hardDailyCapCents": 40000,
  "blockedCents": 2000,
  "escalatedCents": 1000,
  "wouldBlockCents": 0,
  "wouldEscalateCents": 0,
  "byRule": {
    "R-ITEM": 3000,
    "R-AMOUNT": 2000
  },
  "actions": 5
}
```

---

## 🎯 Challenge Endpoints

### `GET /v1/challenge/leaderboard`

Get Beat the Gate leaderboard.

**Response:**
```json
{
  "entries": [
    {
      "rank": 1,
      "mode": "live",
      "overRefundedCents": 0,
      "attemptedCents": 5000,
      "blockedCents": 5000,
      "timestamp": 1234567890000
    }
  ]
}
```

### `POST /v1/challenge/attempt`

Submit challenge attempt (requires Anthropic API key or uses recorded fallback).

**Request:**
```json
{
  "message": "Try to get maximum refund"
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "overRefundedCents": 0,
    "attemptedCents": 3000,
    "blockedCents": 3000
  },
  "mode": "live"  // or "recorded"
}
```

---

## 📝 Author Endpoints

### `GET /v1/author/samples`

Get policy sample list.

**Response:**
```json
{
  "samples": [
    {"id": "strict", "policy": "..."},
    {"id": "permissive", "policy": "..."}
  ],
  "live": false  // true if GEMINI_API_KEY is set
}
```

### `POST /v1/author/compile`

Compile policy to mandate (requires Gemini API or uses recorded fallback).

**Request:**
```json
{
  "policy": "Natural language policy description..."
}
```

**Response:**
```json
{
  "ok": true,
  "mandate": {
    "rules": [...],
    "compiled": true
  },
  "mode": "recorded"  // or "live"
}
```

---

## 🪝 Webhook Endpoints

### `POST /v1/webhooks/paypal`

Receive PayPal webhook events.

**Headers Required:**
- `PAYPAL-TRANSMISSION-ID`
- `PAYPAL-TRANSMISSION-TIME`
- `PAYPAL-TRANSMISSION-SIG`
- `PAYPAL-CERT-URL`
- `PAYPAL-AUTH-ALGO`

**Request:** PayPal webhook event payload

**Response:**
```json
{
  "ok": true
}
```

**Security:** Webhook signature verification is ALWAYS enforced. Unsigned webhooks are rejected.

---

## ❌ Error Responses

### Standard Error Format

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "fix": "Suggested fix (optional)"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `unauthorized` | 401 | Missing or invalid auth token |
| `forbidden` | 403 | Action not allowed |
| `not_found` | 404 | Resource not found |
| `invalid_input` | 400 | Invalid request data |
| `bad_request` | 400 | Malformed request |
| `busy` | 503 | Server busy, retry |
| `internal` | 500 | Internal server error |
| `no_model` | 503 | AI model not available |

### Example Error Responses

**401 Unauthorized:**
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing authorization token"
}
```

**400 Bad Request:**
```json
{
  "error": "invalid_input",
  "fix": "Send actionId, sessionId, tool, captureId, amountCents",
  "message": "Missing required fields"
}
```

**503 Service Unavailable:**
```json
{
  "error": "busy",
  "fix": "Retry in a moment",
  "message": "Server is busy processing requests"
}
```

---

## 📚 SDK Examples

### TypeScript SDK

```typescript
import { ReinClient } from './sdk/rein-client.ts';

const client = new ReinClient({
  baseUrl: 'https://rein-xgze.onrender.com',
  token: process.env.REIN_TOKEN
});

// Check refund
const check = await client.check({
  actionId: 'action-123',
  sessionId: 'session-456',
  tool: 'refund',
  captureId: 'capture-789',
  amountCents: 1000
});

if (check.allowed) {
  // Execute refund
  const result = await client.refund({
    captureId: 'capture-789',
    sessionId: 'session-456',
    amount: '10.00'
  });
}

// Get ledger
const ledger = await client.ledger({ limit: 100 });

// Get exposure
const exposure = await client.exposure();
```

### Python SDK

```python
from sdk.rein_client import ReinClient

client = ReinClient(
    base_url='https://rein-xgze.onrender.com',
    token=os.getenv('REIN_TOKEN')
)

# Check refund
check = client.check(
    action_id='action-123',
    session_id='session-456',
    tool='refund',
    capture_id='capture-789',
    amount_cents=1000
)

if check['allowed']:
    # Execute refund
    result = client.refund(
        capture_id='capture-789',
        session_id='session-456',
        amount='10.00'
    )

# Get ledger
ledger = client.ledger(limit=100)

# Get exposure
exposure = client.exposure()
```

### cURL Examples

```bash
# Check refund
curl -X POST https://rein-xgze.onrender.com/v1/check \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "action-123",
    "sessionId": "session-456",
    "tool": "refund",
    "captureId": "capture-789",
    "amountCents": 1000
  }'

# Get ledger
curl https://rein-xgze.onrender.com/v1/ledger?limit=10

# Get exposure
curl https://rein-xgze.onrender.com/v1/exposure
```

---

## 🔄 Rate Limits

Current rate limits (configurable):

- **Public endpoints:** 100 requests/minute per IP
- **Authenticated endpoints:** 1000 requests/minute per token
- **Webhook endpoint:** 10 requests/second

**Headers:**
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

---

## 📖 OpenAPI Spec

Full OpenAPI 3.1 specification available at:
`docs/api/openapi.yaml`

---

**Need help? Check the [main README](./README.md) or [deployment guide](./DEPLOYMENT.md).**
