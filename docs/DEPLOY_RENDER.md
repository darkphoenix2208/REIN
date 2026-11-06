# Deploy to Render.com

Rein is Render-ready via `render.yaml`. This guide walks through one-click deployment.

## Prerequisites

- Render.com account (free tier works)
- PayPal sandbox app credentials (optional for live mode)
- GitHub repo pushed (Render builds from Git)

## Step 1: Push to GitHub

```bash
# In D:\Leash-main\Leash-main
git remote add origin https://github.com/YOUR_USERNAME/rein.git
git push -u origin master
```

## Step 2: Create Render Service

1. Go to https://dashboard.render.com
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — click **Apply**

## Step 3: Configure Environment Variables

Render creates the service from `render.yaml`, but you need to set secrets in the dashboard:

### Required (SIMULATED mode)
```
REIN_TOKEN=<generate random 32-char string>
NODE_ENV=production
```

### Optional (LIVE-FIRE mode with PayPal)
```
PAYPAL_CLIENT_ID=<your sandbox app client ID>
PAYPAL_CLIENT_SECRET=<your sandbox app client secret>
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
```

### Optional (Gemini policy compiler)
```
GEMINI_API_KEY=<your Gemini API key>
```

### Optional (Channel3 price checks)
```
CHANNEL3_API_KEY=<your Channel3 API key>
```

**Generate REIN_TOKEN:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 4: Deploy

Render builds automatically on push. Watch the build logs:

1. Build runs `npm ci`
2. Compiles TypeScript (`npm run typecheck`)
3. Builds web UI (`npm run web:build`)
4. Runs tests (`npm test`)
5. Starts server (`npm start`)

**Build time**: ~3 minutes  
**Cold start**: ~10 seconds

## Step 5: Seed Database

Render uses ephemeral disk (resets on deploy). To persist data:

1. Upgrade to Render Disk (paid) and mount at `/data`
2. Set `REIN_DB=/data/rein.db`
3. SSH into instance: `npm run seed-db`

**OR** use in-memory mode (demo only):
- Database resets on every deploy
- Good for hackathon judging, not production

## Step 6: Configure PayPal Webhooks (optional)

If using LIVE-FIRE mode:

1. Get your Render URL: `https://your-app.onrender.com`
2. In PayPal Developer Dashboard → Webhooks:
   - URL: `https://your-app.onrender.com/v1/webhooks/paypal`
   - Events: `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED`
3. Note: Signature verification is not fully implemented (accepts unverified)

## Step 7: Verify Deployment

```bash
# Check health
curl https://your-app.onrender.com/v1/mandate

# Run demo ticket
curl -X POST https://your-app.onrender.com/v1/demo/run \
  -H 'Content-Type: application/json' \
  -d '{"ticketId": 1}'

# Check ledger
curl https://your-app.onrender.com/v1/ledger?limit=10
```

## Troubleshooting

### Build fails: "engine Not compatible"
- Render uses Node 22.18+ (specified in package.json engines)
- If using local 22.14, upgrade or wait for Render's build (it auto-installs correct version)

### Tests timeout
- Render free tier has limited CPU
- Increase test timeout: `--test-timeout=120000` in package.json
- Or skip tests: remove `npm test` from render.yaml build command

### Database locked errors
- Use `REIN_DB_DRIVER=better-sqlite3` (faster, sync)
- Or increase `busy_timeout` in db.ts

### Rate limiting too aggressive
- Set `REIN_RATE_LIMIT_PER_MIN=500` (default 240)
- Or disable for demo: `REIN_RATE_LIMIT_PER_MIN=999999`

## render.yaml Explained

```yaml
services:
  - type: web
    name: rein
    runtime: node
    buildCommand: npm ci && npm run web:build && npm test
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    disk:
      name: rein-data
      mountPath: /data
      sizeGB: 1
```

- **runtime**: Node.js (version from package.json engines)
- **buildCommand**: Install deps, build UI, run tests
- **startCommand**: `node server/index.ts` (via npm start)
- **envVars**: PORT auto-set by Render, NODE_ENV=production
- **disk**: Optional persistent storage (paid tier)

## Cost

- **Free tier**: 750 hours/month, sleeps after 15min idle, 512MB RAM
- **Starter ($7/mo)**: Always-on, 512MB RAM
- **Standard ($25/mo)**: 2GB RAM, autoscaling
- **Disk**: $0.25/GB/month

**Recommendation for hackathon demo**: Free tier + in-memory DB (no disk)

## Post-Deploy Checklist

- [ ] `/v1/mandate` returns policy JSON
- [ ] `/demo` page loads (React UI)
- [ ] Run ticket 1 → ALLOWED
- [ ] Run ticket 2 → BLOCKED
- [ ] `/ledger` shows hash chain ✓
- [ ] `/ops` dashboard shows metrics
- [ ] `/attack-lab` loads 8 vectors
- [ ] SIMULATED mode chip visible (or LIVE-FIRE if PayPal configured)

## Security Notes

- **REIN_TOKEN**: Keep secret, rotate periodically
- **PayPal credentials**: Sandbox only, never commit to repo
- **HTTPS**: Render provides TLS automatically
- **Rate limiting**: Enabled by default (240 req/min per IP)
- **Trust proxy**: Auto-configured by Render (REIN_TRUST_PROXY=1)

## Rollback

Render keeps deploy history. To rollback:

1. Dashboard → your service → Deploys tab
2. Find previous working deploy
3. Click **Redeploy**

## Next Steps

- Point custom domain (optional)
- Enable Render monitoring/alerts
- Set up GitHub Actions for CI/CD
- Add Sentry for error tracking
- Configure log aggregation (Papertrail, Datadog)

---

**Need help?** Open an issue on GitHub or check Render docs: https://render.com/docs
