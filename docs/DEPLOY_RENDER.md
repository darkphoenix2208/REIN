# Deploying Rein to Render

> [!IMPORTANT]
> **Status**: Everything touching live Render deployment is **NOT VERIFIED** until an operator deploys to Render with production credentials. The implementation includes local fallbacks and tested idempotent HTTP endpoints.

Rein is designed to run securely and reliably on Render as a single-instance service with persistent disk storage for its SQLite audit ledger.

---

## 1. Architecture on Render

- **Runtime**: Node.js 22 LTS
- **Build Command**: `npm ci --include=dev && npm run web:build`
- **Start Command**: `node --experimental-strip-types server/index.ts`
- **Health Checks**:
  - `/healthz` (liveness: process alive)
  - `/readyz` (readiness: SQLite readable and writable)
- **Database**: Single-instance SQLite stored on Render Persistent Disk mounted at `/var/data` (`REIN_DB=/var/data/rein.db`).
- **Proxy Trust**: `REIN_TRUST_PROXY=1` (ensures accurate client IP detection behind Render's reverse proxy for rate limiting).

---

## 2. Environment Variables

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enforces production mode and strict security |
| `NODE_VERSION` | **Yes** | `22` | Specifies Node.js LTS runtime |
| `REIN_TOKEN` | **Yes** | — | 32+ char bearer token protecting operator endpoints |
| `REIN_TRUST_PROXY` | **Yes** | `1` | Enables 1 proxy hop trust for client IP rate limits |
| `REIN_DB` | **Yes** | `/var/data/rein.db` | Path to persistent SQLite ledger database |
| `REIN_LOCK_OPERATOR_ENDPOINTS` | Recommended | `1` | Locks `/ledger` and `/exposure` behind `REIN_TOKEN` |
| `REIN_PUBLIC_URL` | Recommended | Auto-detected | Canonical public HTTPS URL on Render |
| `ANTHROPIC_API_KEY` | Optional | — | Enables live Claude agent in "Beat the Gate" |
| `CHANNEL3_API_KEY` | Optional | — | Enables live product pricing intelligence |
| `PAYPAL_CLIENT_ID` | Optional | — | PayPal sandbox App Client ID (never live keys) |
| `PAYPAL_CLIENT_SECRET` | Optional | — | PayPal sandbox Secret (never live keys) |
| `REIN_DISABLE_CHALLENGE` | Optional | `0` | Kill switch (`1` disables challenge endpoint with 503) |
| `RENDER_API_KEY` | Optional | — | For Render Workflows container dispatch |

---

## 3. Public Read-Only Demo Mode (Safe through Dec 15)

To leave Rein safely hosted online through December 15 for judges without risk of credential leakage, excessive spend, or unauthorized ledger tampering:

1. **Simulated by Default**: If PayPal credentials are not configured, Rein runs in SIMULATED mode. The UI prominently displays a `SIMULATED` badge.
2. **Operator Lockdown (`REIN_LOCK_OPERATOR_ENDPOINTS=1`)**:
   - Administrative and ledger modification endpoints require the `REIN_TOKEN` bearer header.
   - Public visitors can interact with the Demo, read the public mandate, attempt the Challenge, and view the Verify page.
3. **Rate Limiting**:
   - Built-in per-IP rate limiting (240 req/min default; 30 req/min on `/demo/run`).
   - Challenge attempt rate limit: 3 attempts per IP per 5 minutes.
4. **Kill Switch**:
   - If abuse occurs, set `REIN_DISABLE_CHALLENGE=1` in the Render dashboard to instantly deactivate challenge execution.

---

## 4. Render Workflows (@renderinc/sdk)

Rein integrates with Render Workflows (`@renderinc/sdk`) for background tasks:

- **Isolated Execution**: Workflows run inside isolated containers without direct filesystem access to SQLite.
- **Idempotent HTTP API**: Containers call Rein's authenticated endpoints over HTTPS:
  - `POST /v1/workflow/reconcile`: Reconciles `unknown_outcome` transactions and cleans up elapsed reservations.
  - `POST /v1/workflow/attack-lab/run`: Runs the 8 adversarial test vectors in parallel and aggregates defense telemetry.
- **Local Fallback**: When `RENDER_API_KEY` is not present, `server/render-workflow.ts` automatically executes tasks locally with zero downtime.

---

## 5. One-Click Deploy Steps

1. Fork or push this repository to GitHub.
2. Log into [Render.com](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Select the repository. Render automatically reads `render.yaml`.
5. Provide `REIN_TOKEN` (generate via `openssl rand -hex 32` or `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`).
6. Click **Apply**.
7. Once deployed, verify:
   ```bash
   # Liveness check
   curl -i https://<your-service>.onrender.com/healthz

   # Readiness check
   curl -i https://<your-service>.onrender.com/readyz
   ```
