# Customer Velocity Tracking

Prevent abuse by tracking per-customer refund frequency and amounts.

## Overview

Velocity tracking enforces per-customer limits over rolling time windows:
- **Action limits**: Maximum number of refunds per customer per window
- **Amount limits**: Maximum total refund amount per customer per window
- **Configurable windows**: Typically 24 hours, fully configurable

## Configuration

Add to `mandate.json`:

```json
{
  "version": 1,
  "hardDailyCapCents": 40000,
  "velocityRule": {
    "maxActions": 5,
    "maxAmountCents": 10000,
    "windowHours": 24
  }
}
```

## Behavior

- **Allowed**: Customer within limits, refund proceeds
- **Approaching** (≥80% of limit): Escalates for human review
- **Exceeded**: Blocks refund, returns error

## Rule IDs

- `R-VELOCITY-ACTIONS`: Too many refunds
- `R-VELOCITY-AMOUNT`: Too much money refunded
- `R-VELOCITY-APPROACHING`: Close to limits (escalation)

## Monitoring

The Ops Dashboard (`/ops`) shows:
- Current velocity rule settings
- Top customers by recent activity
- Utilization percentages
- Warning indicators for customers approaching limits

## Testing

Velocity tracking respects customer isolation - different customers are tracked separately.

## Customer ID

The `customerId` field must be provided in refund requests:

```bash
curl -X POST /v1/refund \
  -H "Authorization: Bearer $REIN_TOKEN" \
  -d '{
    "captureId": "cap-123",
    "sessionId": "sess-456",
    "customerId": "customer@example.com",
    "amount": "10.00"
  }'
```

If `customerId` is not provided, velocity tracking is skipped (backwards compatible).
