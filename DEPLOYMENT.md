# 🚀 Deployment Guide

This guide covers deploying Rein to production on Render.

## 📋 Prerequisites

Before deploying, you need:

1. **GitHub Repository** - Your code pushed to GitHub
2. **Render Account** - Sign up at https://render.com (free tier available)
3. **PayPal Developer Account** - For sandbox API keys
4. **API Keys** (optional but recommended):
   - PayPal Sandbox credentials
   - Webhook ID (created after initial deployment)

---

## 🎯 Quick Deploy (5 Minutes)

### Step 1: Create Render Service

1. Go to https://render.com and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your repository: `rein`
4. Configure settings:
   - **Name:** `rein` (or your choice)
   - **Region:** Choose closest to you
   - **Branch:** `master`
   - **Build Command:** `npm ci --include=dev && npm run web:build`
   - **Start Command:** `node --experimental-strip-types server/index.ts`
   - **Plan:** **Starter** (required for persistent disk)

### Step 2: Add Environment Variables

Click **"Advanced"** and add these environment variables:

#### Required:
```bash
NODE_VERSION=22
NODE_ENV=production
REIN_TRUST_PROXY=1
REIN_DB=/var/data/rein.db
```

#### Security (Generate these):
```bash
# Generate with: openssl rand -hex 32
REIN_TOKEN=<your-generated-token>

# Signs ledger checkpoints; keep secret. Unset = auto-generated to REIN_CHECKPOINT_KEY_FILE
REIN_CHECKPOINT_KEY=<your-base64-or-hex-ed25519-private-key>
REIN_CHECKPOINT_KEY_FILE=/var/data/.checkpoint-key.json
```

#### PayPal Sandbox:
```bash
PAYPAL_CLIENT_ID=<your-paypal-client-id>
PAYPAL_CLIENT_SECRET=<your-paypal-secret>
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
```

#### After First Deploy (see below):
```bash
REIN_PUBLIC_URL=https://your-app.onrender.com
PAYPAL_WEBHOOK_ID=<your-webhook-id>
```

### Step 3: Add Persistent Disk

Under **"Disks"**:
- **Name:** `rein-data`
- **Mount Path:** `/var/data`
- **Size:** 1 GB

### Step 4: Deploy

Click **"Create Web Service"** and wait 5-10 minutes for deployment.

---

## 🔗 Post-Deployment Setup

### 1. Set REIN_PUBLIC_URL

After deployment completes:

1. Copy your Render URL: `https://your-app.onrender.com`
2. Go to **"Environment"** tab
3. Add/Update:
   ```bash
   REIN_PUBLIC_URL=https://your-app.onrender.com
   ```
4. Save (triggers auto-redeploy)

### 2. Configure PayPal Webhook

1. Go to https://developer.paypal.com/dashboard/
2. Navigate to **"Webhooks"** section
3. Click **"Add Webhook"**
4. **Webhook URL:** `https://your-app.onrender.com/v1/webhooks/paypal`
5. Select events:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `PAYMENT.CAPTURE.DENIED`
6. Click **"Save"**
7. Copy the **Webhook ID** shown (e.g., `4RA34111CF662345G`)

### 3. Add Webhook ID to Render

1. Go to Render **"Environment"** tab
2. Add:
   ```bash
   PAYPAL_WEBHOOK_ID=<your-webhook-id>
   ```
3. Save (triggers auto-redeploy)

---

## ✅ Verify Deployment

### Test Health Endpoints:
```bash
curl https://your-app.onrender.com/health
# Should return: {"ok":true,"mode":"live"}

curl https://your-app.onrender.com/healthz
# Should return: {"status":"ok","uptime":...,"mode":"live"}
```

### Test UI Pages:
- **Demo:** https://your-app.onrender.com/
- **Ledger:** https://your-app.onrender.com/ledger
- **Ops:** https://your-app.onrender.com/ops
- **Attack Lab:** https://your-app.onrender.com/attack-lab

### Test API:
```bash
curl https://your-app.onrender.com/v1/exposure
# Should return exposure metrics
```

---

## 🔧 Configuration Options

### Optional Environment Variables:

```bash
# AI Features (Optional)
ANTHROPIC_API_KEY=<your-anthropic-key>  # Beat the Gate challenge (Anthropic)
GROQ_API_KEY=<your-groq-key>            # Beat the Gate challenge (Groq, alternative)
GROQ_MODEL=llama-3.3-70b-versatile      # Groq model supporting tool use
GEMINI_API_KEY=<your-gemini-key>        # Policy compilation

# Notifications (Optional)
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_CHAT_ID=<your-chat-id>
SLACK_BOT_TOKEN=<your-slack-token>      # ⚠️ NOT BUILT
SLACK_APPROVAL_CHANNEL=#approvals       # ⚠️ NOT BUILT

# Advanced
REIN_EXPOSE_AMOUNT_TOOL=1              # Enable amount tool in MCP
REIN_LEDGER_KEY=<your-ledger-key>      # Ledger encryption
REIN_DISABLE_CHALLENGE=1               # Disable challenge page
```

### Unlock Operator Endpoints (Not Recommended for Public Demo):

By default, `/ledger` and `/ops` endpoints are public. To require authentication:

```bash
REIN_LOCK_OPERATOR_ENDPOINTS=1
```

Note: This will break the web UI unless you modify it to send auth tokens.

---

## 📊 Monitoring

### Render Dashboard:
- **Logs:** View real-time application logs
- **Metrics:** CPU, Memory, Request rate
- **Events:** Deployment history

### Application Health:
- Check `/healthz` endpoint
- Monitor `/v1/exposure` for spending
- Review `/v1/ledger` for audit trail

---

## 🔄 Updates & Redeployment

### Automatic Deployments:
Render auto-deploys when you push to the `master` branch.

### Manual Redeploy:
1. Go to Render dashboard
2. Click **"Manual Deploy"**
3. Choose **"Clear build cache & deploy"** (if needed)

### Update Environment Variables:
Changes to environment variables trigger automatic redeployment.

---

## 🐛 Troubleshooting

### Build Fails:
- Check build logs in Render dashboard
- Verify Node version is 22+
- Ensure all dependencies are in `package.json`

### Pages Not Loading:
- Check `/healthz` endpoint
- Verify `web/dist` folder was built
- Check Render logs for errors

### Ledger/Ops Pages Show Errors:
- Ensure `REIN_LOCK_OPERATOR_ENDPOINTS` is NOT set to `1`
- Or remove it entirely from environment variables

### PayPal Webhooks Not Working:
- Verify webhook URL is correct: `/v1/webhooks/paypal`
- Check `PAYPAL_WEBHOOK_ID` is set
- Test webhook in PayPal dashboard

---

## 🔒 Security Checklist

- ✅ HTTPS enabled (automatic on Render)
- ✅ `REIN_TOKEN` is a strong random value
- ✅ `ED25519_PRIVATE_KEY` is unique and secret
- ✅ PayPal credentials are sandbox only
- ✅ `.env` file is not committed to git
- ✅ `REIN_TRUST_PROXY=1` is set for Render
- ✅ Webhooks use signature verification

---

## 📈 Production Deployment

**Current Status:** Deployed at https://rein-xgze.onrender.com

**Mode:** LIVE (verified via `probe:live`: `{"status":"ok","mode":"live"}`) — PayPal Sandbox credentials configured on Render; real sandbox refund execution, reconciler, and webhook delivery remain ⚠️ NOT VERIFIED.

**Features Enabled:**
- ✅ Simulated Refunds & Payouts
- ✅ Webhook signature verification
- ✅ Hash-chained ledger
- ✅ Ed25519 signatures
- ✅ All 11 UI pages
- ✅ Attack Lab
- ✅ Ops Dashboard

**Optional Features (Disabled / NOT VERIFIED):**
- ⏸️ Anthropic API (uses recorded fallback)
- ⏸️ Groq API (uses recorded fallback)
- ⏸️ Gemini API (uses recorded fallback)
- ⏸️ Telegram notifications
- ⚠️ PayPal Live Sandbox execution (NOT VERIFIED)

---

## 📋 Post-Deploy Checklist

After deploying to Render:

1. **Run Live Probe**:
   ```bash
   npm run probe:live https://your-app.onrender.com
   ```
   Confirm `/healthz` returns `status: "ok"`, verify reported mode (`sim` or `live`), and inspect ledger head / latest checkpoint.

2. **Verify Checkpoint & Ledger Persistence Across Restarts**:
   - Note the public key from `https://your-app.onrender.com/v1/ledger/pubkey` and latest sequence number.
   - Trigger a service restart from Render dashboard.
   - Re-run `npm run probe:live https://your-app.onrender.com`.
   - Confirm ledger rows count and checkpoint `publicKey` remain identical (ensures disk mounted at `/var/data` and key file `/var/data/.checkpoint-key.json` persisted).

3. **One Real Sandbox Refund**:
   - If `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are provided, execute one test refund via `/demo` or API.
   - Verify `mode: "live"` in `/healthz` and check transaction in PayPal developer sandbox dashboard.

4. **Approval Link on Mobile Phone**:
   - Trigger an escalated refund (e.g., Ticket 3 or high-value amount).
   - Open the approval link (`/approve/:id`) on a smartphone browser.
   - Confirm responsive mobile UI and button interactions work cleanly.

---

## 🆘 Support

**Issues?** Check:
1. Render logs for errors
2. `/healthz` endpoint status
3. Environment variables configuration
4. PayPal sandbox dashboard

**Documentation:**
- [Render Docs](https://render.com/docs)
- [PayPal Webhooks](https://developer.paypal.com/docs/api-basics/notifications/webhooks/)
- [Project README](./README.md)

---

**Built with ❤️ by darkphoenix2208**
