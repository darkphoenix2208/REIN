# Policy Intelligence Features

Advanced policy intelligence features in Rein: customer velocity, two-person approval, and TOTP.

## Customer Velocity Tracking

Prevent abuse by limiting refunds per customer within 24 hours.

**Mandate Fields:**
```typescript
customerVelocityMaxActions?: number;      // Max refunds per customer per 24h
customerVelocityMaxAmountCents?: number;  // Max total refunded per customer per 24h
```

**Rules:**
- `R-CUSTOMER-VELOCITY-ACTIONS`: Blocks when customer exceeds action limit
- `R-CUSTOMER-VELOCITY-AMOUNT`: Blocks when customer exceeds amount limit
- **Type:** Hard rule (cannot be bypassed with approval)

## Two-Person Approval

Require two separate human approvals for high-value refunds.

**Mandate Fields:**
```typescript
requireTwoPersonApproval?: boolean;
twoPersonThresholdCents?: number;  // Defaults to hardMaxCents
```

**Policy State:**
```typescript
approvalCount?: number;  // 0, 1, or 2
```

**Rules:**
- `R-TWO-PERSON-REQUIRED`: Escalates when < 2 approvals
- **Type:** Soft rule (satisfied by 2nd approval)

## TOTP Authentication

Require Time-Based One-Time Password for high-value actions.

**Mandate Fields:**
```typescript
requireTOTPForHighValue?: boolean;
```

**Policy State:**
```typescript
totpCode?: string;  // 6-digit code
```

**Implementation:**
- RFC 6238 standard TOTP
- 30-second windows, ±1 tolerance
- HMAC-SHA1, base32 secret

**API:**
```typescript
import { generateTOTPSecret, verifyTOTP } from './totp.ts';

const secret = generateTOTPSecret();
const valid = verifyTOTP(userCode, secret);
```

## Slack Integration

Send approval requests to Slack with interactive buttons.

**Environment:**
```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APPROVAL_CHANNEL=C...
```

**API:**
```typescript
import { sendApprovalRequest } from './slack.ts';

await sendApprovalRequest({
  actionId, amountCents, reason, approvalUrl, customerEmail
});
```

## Tests

- `tests/policy-intelligence.test.ts` (9 tests)
- `tests/totp.test.ts` (8 tests)  
- `tests/slack.test.ts` (4 tests)

**Total:** 21 new tests, all passing

