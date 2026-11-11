// HTTP API (Express). One service: /v1/* here, the built SPA is served by index.ts in Phase 3. Fail closed everywhere.
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { isBusy, ReinBusyError, openDb, type Db } from './db.ts';
import { applySchema } from './schema.ts';
import { approve, check, preventedLoss, result, sweep } from './dispatch.ts';
import { describeMandate } from './config.ts';
import { verifyChain } from './ledger.ts';
import { readState, runRefund, type GateDeps } from './gate.ts';
import { toCents } from './paypal.ts';
import { BOOT_ID, demoRouter, tickets } from './demo.ts';
import { aiSummary } from './llm.ts';
import { rateLimit } from './ratelimit.ts';
import { compilePolicy, FIELDS } from './compiler.ts';
import { askGemini } from './llm.ts';
import { readFileSync } from 'node:fs';
import { signCheckpoint, storeCheckpoint, getLatestCheckpoint, verifyCheckpoint, getPublicKeyInfo } from './checkpoint.ts';
import { getLeaderboard, initChallengeSchema, checkRateLimit, getTotalSpent, recordAttempt, getRecordedAttempt, isKillSwitchActive, hasApiKey } from './beat-the-gate.ts';
import { backtestMandate, BacktestRequestSchema, SaveMandateVersionSchema } from './backtest.ts';
import { saveMandateVersion } from './mandate-version.ts';
import Anthropic from '@anthropic-ai/sdk';
import { generateEvidencePackPdf } from './evidence-pdf.ts';
import { listMandateVersions, getCurrentMandateVersion, mandateHash } from './mandate-version.ts';
import { searchProducts, getProduct, getSimilarProducts, type Channel3Client } from './channel3.ts';
import { runPurchase, runPriceMatch, runShoppingLoop } from './gate.ts';

const eq = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface AppOptions {
  token?: string | undefined; // REIN_TOKEN; REQUIRED in production for the hook endpoints
  production?: boolean;
  trustProxy?: number | boolean; // number of proxy hops in front (REIN_TRUST_PROXY); default none
  rateLimitPerMin?: number;
  demoRunsPerMin?: number;
  fetchImpl?: typeof fetch; // tests
  askImpl?: (prompt: string) => Promise<string>; // tests
  lockOperatorEndpoints?: boolean;
  challengeClient?: any;
  challengeDb?: Db; // Injected challenge database for testing (otherwise creates in-memory)
  channel3Client?: Channel3Client; // REIN_LOCK_OPERATOR_ENDPOINTS=1: require the bearer token on /ledger and /exposure too.
  // Off by default so the public demo's own transparency feature (anyone can watch the hash chain) keeps working unauthenticated.
  // /approval/:id and POST /approve stay public regardless: that flow is designed for a human clicking an emailed link with no login,
  // and its secret is the per-action token, not a service-wide bearer.
}

export function createApp(d: GateDeps, o: AppOptions = {}): express.Express {
  const app = express();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // React needs unsafe-eval in dev
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  app.set('trust proxy', o.trustProxy ?? false); // only honor X-Forwarded-For when a proxy is configured: otherwise any client could pick its own rate-limit key
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const summaries = new Map<string, string | null>(); // one Gemini call per approval, not one per page load
  const api = express.Router();
  api.use(rateLimit(o.rateLimitPerMin ?? 240));
  api.use('/demo/run', rateLimit(o.demoRunsPerMin ?? 30));
  // /v1/refund moves real (sandbox) money when PayPal credentials are present: same bearer token, and disabled (503) if none is configured
  api.use('/refund', (req: Request, res: Response, next: NextFunction) => {
    if (!d.paypal) return next();
    if (!o.token) return void res.status(503).json({ error: 'live refunds disabled: REIN_TOKEN not set' });
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });
  // hook endpoints: bearer token; FAIL CLOSED (503) if unset in production
  api.use(['/check', '/result'], (req: Request, res: Response, next: NextFunction) => {
    if (!o.token) return o.production ? void res.status(503).json({ error: 'hook endpoints disabled: REIN_TOKEN not set' }) : next();
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });
  // operator-facing read endpoints (full ledger, spend exposure): public by default for the demo's own transparency feature;
  // an operator running this beyond the demo can require the same bearer token here (REIN_LOCK_OPERATOR_ENDPOINTS=1).
  api.use(['/ledger', '/exposure'], (req: Request, res: Response, next: NextFunction) => {
    if (!o.lockOperatorEndpoints) return next();
    if (!o.token) return void res.status(503).json({ error: 'operator endpoints locked: REIN_TOKEN not set' });
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });

  // Render workflow endpoints: service token required (fails closed 401 if missing/wrong, 503 if unset)
  api.use('/workflow', (req: Request, res: Response, next: NextFunction) => {
    const token = o.token ?? process.env.REIN_TOKEN;
    if (!token) return void res.status(503).json({ error: 'service_unavailable', reason: 'Workflow service token not configured' });
    eq(req.get('authorization') ?? '', `Bearer ${token}`) ? next() : void res.status(401).json({ error: 'unauthorized', reason: 'Invalid or missing service bearer token' });
  });

  const cents = (v: unknown): number | null | typeof NaN => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : NaN);

  // Hook path: the agent's own PayPal tool is gated; Rein decides and reserves, the hook allows or blocks.
  api.post('/check', async (req, res) => {
    const b = req.body ?? {};
    const c = cents(b.amountCents);
    if (typeof b.actionId !== 'string' || typeof b.sessionId !== 'string' || typeof b.captureId !== 'string' || !['refund', 'refund_items'].includes(b.tool) || Number.isNaN(c))
      return void res.status(400).json({ error: 'invalid_input', fix: 'Send actionId, sessionId, tool ("refund" or "refund_items"), captureId, integer amountCents or null.' });
    const ext = await readState(d, b.captureId);
    res.json(check(d.db, d.mandate, { actionId: b.actionId, sessionId: b.sessionId, tool: b.tool, captureId: b.captureId, amountCents: c as number | null, ...(typeof b.currency === 'string' ? { currency: b.currency } : {}), ...(Array.isArray(b.items) ? { items: b.items } : {}) }, Date.now(), ext, d.paypal ? 'live' : 'sim'));
  });
  api.post('/result', (req, res) => {
    const b = req.body ?? {};
    if (typeof b.actionId !== 'string' || !['executed', 'failed', 'unknown'].includes(b.outcome)) return void res.status(400).json({ error: 'invalid_input' });
    result(d.db, { actionId: b.actionId, outcome: b.outcome, refundId: typeof b.refundId === 'string' ? b.refundId : undefined }, Date.now(), d.paypal ? 'live' : 'sim');
    res.json({ ok: true });
  });

  // Direct path (demo UI, sim mode): the full pipeline including the execute step.
  api.post('/refund', async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.captureId !== 'string' || typeof b.sessionId !== 'string') return void res.status(400).json({ error: 'invalid_input' });
    const items = Array.isArray(b.items) ? b.items.map((i: any) => ({ itemId: String(i.itemId), qty: Number(i.qty ?? 1) })) : undefined;
    const amt = typeof b.amount === 'string' ? toCents(b.amount) : null;
    res.json(await runRefund(d, { sessionId: b.sessionId, tool: items ? 'refund_items' : 'refund', captureId: b.captureId, amountCents: amt, ...(items ? { items } : {}) }));
  });

  // POST only: GET /approve/:id in the SPA renders the page and changes nothing
  api.post('/approve', (req, res) => {
    const b = req.body ?? {};
    const r = approve(d.db, d.mandate, { actionId: String(b.actionId), token: String(b.token ?? ''), decision: b.decision === 'deny' ? 'deny' : 'approve' }, Date.now(), undefined, d.paypal ? 'live' : 'sim');
    res.status(r.ok ? 200 : r.code).json(r);
  });

  api.get('/ledger', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const rows = d.db.all('SELECT l.seq, l.action_id, l.event, l.hash, l.created_at, a.rule_id, a.amount_cents, a.decision FROM ledger l LEFT JOIN actions a ON a.id=l.action_id ORDER BY l.seq DESC LIMIT ? OFFSET ?', limit, offset);
    res.json({ rows, total: d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0, chain: verifyChain(d.db), mode: d.paypal ? 'LIVE-FIRE' : 'SIMULATED' });
  });

  api.get('/ledger/pubkey', (_req, res) => {
    const info = getPublicKeyInfo();
    if (!info) {
      return void res.status(503).json({ error: 'no_key', reason: 'No checkpoint key configured' });
    }
    res.json(info);
  });

  // Full rows (with prev_hash and payload_json) so a browser can recompute the whole chain itself. /v1/ledger is a lightweight view and cannot be verified.
  api.get('/ledger/export', (_req, res) => {
    const LIMIT = 5000;
    const total = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
    const rows = d.db.all('SELECT l.seq, l.action_id, l.event, l.payload_json, l.prev_hash, l.hash, l.created_at, a.rule_id, a.amount_cents FROM ledger l LEFT JOIN actions a ON a.id = l.action_id ORDER BY l.seq LIMIT ?', LIMIT);
    res.json({ rows, total, truncated: total > LIMIT });
  });

  // Works on a fresh install: with no REIN_CHECKPOINT_KEY set, a key is generated once and kept in a 0600 file outside git (REIN_CHECKPOINT_KEY_FILE
  // or the OS temp dir). On a host with an ephemeral disk set REIN_CHECKPOINT_KEY, or checkpoints signed before a restart will not match the new key.
  api.get('/ledger/checkpoint', (req, res) => {
    let checkpoint;
    try {
      checkpoint = signCheckpoint(d.db, { allowGenerateKey: true });
    } catch (e) {
      return void res.status(409).json({ error: 'chain_broken', reason: e instanceof Error ? e.message : 'The ledger chain does not verify, so nothing was signed.' });
    }
    if (!checkpoint) {
      return void res.status(503).json({ error: 'signing_unavailable', reason: 'No checkpoint signing key could be loaded or created. Set REIN_CHECKPOINT_KEY (32-byte Ed25519 seed or PKCS8, base64).' });
    }
    storeCheckpoint(d.db, checkpoint);
    res.json(checkpoint);
  });

  api.post('/ledger/checkpoint', (_req, res) => {
    const checkpoint = signCheckpoint(d.db, { allowGenerateKey: true });
    if (!checkpoint) {
      return void res.status(503).json({ error: 'signing_unavailable', reason: 'Checkpoint key not available' });
    }
    storeCheckpoint(d.db, checkpoint);
    res.json(checkpoint);
  });

  api.get('/ledger/checkpoint/latest', (_req, res) => {
    const checkpoint = getLatestCheckpoint(d.db);
    if (!checkpoint) {
      return void res.status(404).json({ error: 'no_checkpoint', reason: 'No checkpoint has been created yet' });
    }
    res.json(checkpoint);
  });

  api.get('/ledger/evidence-pack', (req, res) => {
    const format = String(req.query.format ?? 'pdf').toLowerCase();
    const chain = verifyChain(d.db);
    const checkpoint = getLatestCheckpoint(d.db);
    const rows = d.db.all<any>(
      'SELECT l.seq, l.created_at, l.event, l.action_id, l.prev_hash, l.hash, l.mandate_version, l.agent_id, a.rule_id, a.amount_cents FROM ledger l LEFT JOIN actions a ON a.id=l.action_id ORDER BY l.seq ASC'
    );
    const mandateVersions = listMandateVersions(d.db);
    const currentMv = getCurrentMandateVersion(d.db);

    if (format === 'csv') {
      const headers = ['seq', 'created_at', 'event', 'action_id', 'rule_id', 'amount_cents', 'hash', 'prev_hash', 'mandate_version', 'agent_id'];
      const csvLines = [headers.join(',')];
      for (const r of rows) {
        csvLines.push(headers.map((h) => {
          const v = h === 'created_at' ? new Date(r[h]).toISOString() : r[h] ?? '';
          return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v);
        }).join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="rein-ledger-${Date.now()}.csv"`);
      return void res.send(csvLines.join('\n'));
    }

    const packData = {
      generatedAt: new Date().toISOString(),
      mode: (d.paypal ? 'LIVE-FIRE' : 'SIMULATED') as 'LIVE-FIRE' | 'SIMULATED',
      chain,
      checkpoint,
      mandate: {
        version: currentMv?.hash ?? mandateHash(d.mandate),
        perActionCapCents: d.mandate.perActionCapCents,
        hardMaxCents: d.mandate.hardMaxCents,
        dailyCapCents: d.mandate.dailyCapCents,
        hardDailyCapCents: d.mandate.hardDailyCapCents,
        rulesCount: (d.mandate as any).rules?.length ?? 0,
      },
      mandateVersions: mandateVersions.map((v) => ({
        id: String(v.id),
        version_hash: v.hash,
        created_at: v.activatedAt,
        created_by: v.activatedBy || 'system',
        description: v.notes || '',
        is_active: currentMv?.id === v.id ? 1 : 0,
      })),
      rows,
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="rein-evidence-pack-${Date.now()}.json"`);
      return void res.json(packData);
    }

    const pdfBuf = generateEvidencePackPdf(packData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rein-evidence-pack-${Date.now()}.pdf"`);
    res.send(pdfBuf);
  });

  api.get('/ledger/verify', (req, res) => {
    const checkpoint = getLatestCheckpoint(d.db);
    if (!checkpoint) {
      return void res.status(404).json({ error: 'no_checkpoint', reason: 'No checkpoint has been created yet' });
    }
    const verification = verifyCheckpoint(d.db, checkpoint);
    res.json({
      checkpoint,
      verification,
      mandate: {
        perActionCapCents: d.mandate.perActionCapCents,
        hardMaxCents: d.mandate.hardMaxCents,
        dailyCapCents: d.mandate.dailyCapCents,
        hardDailyCapCents: d.mandate.hardDailyCapCents,
      },
    });
  });

  api.post('/ledger/verify', (req, res) => {
    const b = req.body?.checkpoint ?? req.body ?? {};
    const { seq, head, timestamp, signature, publicKey } = b;
    if (seq === undefined || !head || !timestamp || !signature || !publicKey) {
      return void res.status(400).json({ error: 'invalid_checkpoint', reason: 'Missing required checkpoint fields' });
    }
    const checkpoint = { seq: Number(seq), head: String(head), timestamp: Number(timestamp), signature: String(signature), publicKey: String(publicKey) };
    const verification = verifyCheckpoint(d.db, checkpoint);
    const currentHead = d.db.val<string>('SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1') || '';
    res.json({
      valid: verification.signatureValid && verification.chainValid,
      checkpoint,
      ledgerHead: currentHead,
      chainValid: verification.chainValid,
      signatureValid: verification.signatureValid,
      error: verification.error,
      message: verification.signatureValid ?
        (verification.chainValid ?
          (head === currentHead ? 'Checkpoint matches current ledger state' : 'Checkpoint is from an older ledger state, but signature is valid') :
          `Tampering detected: ${verification.error || 'Chain invalid'}`) :
        'Checkpoint signature is invalid'
    });
  });
  api.get('/mandate', (_req, res) => res.json({ lines: describeMandate(d.mandate), mandate: d.mandate }));

  api.post('/mandate/backtest', (req, res) => {
    const candidateData = req.body.candidate ?? req.body.mandate ?? req.body;
    if (!candidateData || typeof candidateData !== 'object') {
      return void res.status(400).json({ error: 'invalid_mandate', reason: 'Request body must contain a candidate object' });
    }
    const mergedCandidate = { ...d.mandate, ...candidateData };
    const parsed = BacktestRequestSchema.safeParse({
      candidate: mergedCandidate,
      startDate: req.body.startDate ? Number(req.body.startDate) : undefined,
      endDate: req.body.endDate ? Number(req.body.endDate) : undefined,
      limit: req.body.limit ? Number(req.body.limit) : undefined,
    });

    if (!parsed.success) {
      return void res.status(400).json({
        error: 'invalid_candidate_mandate',
        reason: 'Candidate mandate failed validation',
        details: parsed.error.format(),
      });
    }

    const { candidate, startDate, endDate, limit } = parsed.data;
    const result = backtestMandate(d.db, candidate as any, { startDate, endDate, limit });
    res.json(result);
  });

  api.post('/mandate/version', (req, res) => {
    const rawMandate = req.body.mandate ?? req.body.candidate ?? d.mandate;
    const parsed = SaveMandateVersionSchema.safeParse({
      mandate: { ...d.mandate, ...rawMandate },
      approver: String(req.body.approver ?? ''),
      notes: req.body.notes ? String(req.body.notes) : undefined,
      effectiveFrom: req.body.effectiveFrom ? Number(req.body.effectiveFrom) : undefined,
      effectiveTo: req.body.effectiveTo ? Number(req.body.effectiveTo) : undefined,
    });

    if (!parsed.success) {
      return void res.status(400).json({
        error: 'invalid_mandate_version',
        reason: 'Mandate version payload failed validation',
        details: parsed.error.format(),
      });
    }

    const { mandate, approver, notes, effectiveFrom, effectiveTo } = parsed.data;
    const versionId = saveMandateVersion(d.db, mandate as any, approver, notes, {
      effectiveFrom,
      effectiveTo,
      approver,
    });
    const hash = mandateHash(mandate as any);

    res.json({
      ok: true,
      versionId,
      hash,
      activatedBy: approver,
      effectiveFrom: effectiveFrom ?? Date.now(),
      effectiveTo: effectiveTo ?? null,
    });
  });

  api.post('/mandate/copilot', async (req, res) => {
    const goal = String(req.body.goal ?? '').trim();
    if (!goal) {
      return void res.status(400).json({ error: 'invalid_goal', reason: 'Goal is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const client = o.challengeClient || (apiKey ? new Anthropic({ apiKey }) : null);

    if (!client && !apiKey) {
      // Keyless recorded fallback
      return void res.json({
        mode: 'RECORDED',
        simulated: true,
        goal,
        candidate: {
          ...d.mandate,
          perActionCapCents: 2000,
          hardMaxCents: 5000,
          dailyCapCents: 10000,
          hardDailyCapCents: 15000,
        },
        reasoning: 'RECORDED ADVISORY: Tightened per-action cap to $20.00 and daily cap to $100.00 to reduce exposure based on your goal.',
      });
    }

    try {
      const model = process.env.REIN_CHALLENGE_MODEL || 'claude-3-5-haiku-20241022';
      const prompt = `Current mandate parameters:\n${JSON.stringify(d.mandate, null, 2)}\n\nUser business goal: "${goal}"\n\nRecommend updated numeric parameters (perActionCapCents, hardMaxCents, dailyCapCents, hardDailyCapCents, etc.) as a JSON object matching CandidateMandateSchema. Respond ONLY with valid JSON.`;

      const response = await client.messages.create({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content.find((b: any) => b.type === 'text')?.text || '{}';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      res.json({
        mode: 'LIVE',
        simulated: false,
        goal,
        candidate: { ...d.mandate, ...parsed },
        reasoning: `Suggested adjustments derived by ${model} for goal: "${goal}"`,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'copilot_failed', reason: err.message });
    }
  });
  api.get('/exposure', (req, res) => {
    const sid = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const live = `status IN ('reserved','executed','approved_executed','unknown_outcome') AND action_type='refund' AND created_at>=?`;
    // no sessionId: total across every session (what the ops dashboard wants); with one: that session only
    const spent = (sid
      ? d.db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND ${live}`, sid, Date.now() - 86_400_000)
      : d.db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE ${live}`, Date.now() - 86_400_000)) ?? 0;
    // what the gate actually stopped (enforce mode) next to the shadow-mode "would have" amounts from preventedLoss()
    const sumWhere = (cond: string): number => d.db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE action_type='refund' AND ${cond}`) ?? 0;

    // Add velocity metrics if rule exists
    let velocityMetrics: any = undefined;
    if (d.mandate.velocityRule) {
      const nowMs = Date.now();
      const windowMs = d.mandate.velocityRule.windowHours * 60 * 60 * 1000;
      // Get top customers by recent activity
      const topCustomers = d.db.all<{ customerId: string; actions: number; total: number }>(`
        SELECT
          json_extract(payload_json, '$.customerId') as customerId,
          COUNT(*) as actions,
          SUM(CAST(json_extract(payload_json, '$.amountCents') AS INTEGER)) as total
        FROM ledger
        WHERE created_at >= ?
          AND event IN ('executed', 'approved_executed')
          AND json_extract(payload_json, '$.customerId') IS NOT NULL
        GROUP BY customerId
        ORDER BY total DESC
        LIMIT 10
      `, nowMs - windowMs);

      velocityMetrics = {
        rule: d.mandate.velocityRule,
        topCustomers: topCustomers.map(c => ({
          customerId: c.customerId,
          actions: c.actions,
          amountCents: c.total,
          utilizationPct: Math.max(
            (c.actions / d.mandate.velocityRule!.maxActions) * 100,
            (c.total / d.mandate.velocityRule!.maxAmountCents) * 100
          )
        }))
      };
    }

    res.json({
      spentCents: spent, hardDailyCapCents: d.mandate.hardDailyCapCents,
      blockedCents: sumWhere(`status='blocked'`), escalatedCents: sumWhere(`decision='pending_approval' AND status<>'shadow'`),
      ...preventedLoss(d.db),
      velocity: velocityMetrics
    });
  });
  api.get('/order/:captureId', (req, res) => {
    const captureId = req.params.captureId;
    const order = d.db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', captureId);
    if (!order) return void res.status(404).json({ error: 'capture_not_found' });
    const items = d.db.all<{ item_id: string; name: string; unit_cents: number; qty: number }>('SELECT item_id, name, unit_cents, qty FROM order_items WHERE order_id=?', order.order_id);
    const total = items.reduce((sum, i) => sum + i.unit_cents * i.qty, 0);
    res.json({ captureId, orderId: order.order_id, items, totalCents: total });
  });
  // AUTHOR step: plain-English policy -> DRAFT with plain-language playback. Never activates anything (activation is a deliberate CLI step that refuses while any field is null).
  const SAMPLES = ['coffee', 'apparel', 'handmade'];
  const playback = (f: Record<string, number | boolean | null>): string[] => {
    const usd = (c: unknown) => `$${(Number(c) / 100).toFixed(2)}`;
    const line = (k: string, text: (v: any) => string, name: string) => (f[k] == null ? `NOT SET: ${name}. Rein will not guess; answer this before activating.` : text(f[k]));
    return [
      line('perActionCapCents', (v) => `The agent may refund up to ${usd(v)} on its own.`, 'agent limit per refund'),
      line('hardMaxCents', (v) => `Nothing above ${usd(v)} is ever refunded, even with approval.`, 'absolute maximum refund'),
      line('dailyCapCents', (v) => `In 24 hours the agent alone may refund up to ${usd(v)}.`, 'daily limit'),
      line('hardDailyCapCents', (v) => `The absolute 24-hour limit is ${usd(v)}.`, 'absolute daily limit'),
      line('returnWindowDays', (v) => `Refunds are refused after ${v} days.`, 'return window'),
      line('blockIfOpenDispute', (v) => (v ? 'Refunds are refused while the payment has an open dispute.' : 'Open disputes do not block refunds.'), 'open-dispute rule'),
      line('escalateFullOrder', (v) => (v ? 'Refunding every item of an order needs a person.' : 'Full-order refunds do not need a person.'), 'full-order rule'),
    ];
  };
  const author = express.Router();
  author.get('/samples', (_q, res) => res.json({ samples: SAMPLES.map((n) => ({ id: n, policy: readFileSync(`server/fixtures/demo/policy-${n}.txt`, 'utf8') })), live: !!process.env.GEMINI_API_KEY }));
  author.post('/compile', rateLimit(5), async (req, res) => {
    const policy = typeof req.body?.policy === 'string' ? req.body.policy.slice(0, 4000) : '';
    const sample = typeof req.body?.sample === 'string' ? req.body.sample : '';
    if (!policy.trim() && !SAMPLES.includes(sample)) return void res.status(400).json({ error: 'invalid_input', fix: 'Send the policy text.' });
    let draft; let source = 'live';
    if (process.env.GEMINI_API_KEY && policy.trim()) draft = await compilePolicy(policy, (p) => (o.askImpl ?? askGemini)(p));
    else if (SAMPLES.includes(sample)) { draft = JSON.parse(readFileSync(`server/fixtures/demo/compile-${sample}.json`, 'utf8')); source = 'recorded'; }
    else return void res.status(503).json({ error: 'no_model', fix: 'Compiling your own text needs GEMINI_API_KEY on the server. Pick one of the sample policies to see a recorded compile.' });
    res.json({ source, runs: draft.runs, disagreements: draft.disagreements, fields: draft.fields, playback: playback(draft.fields), unsupported: draft.unsupported.slice(0, 40), questions: draft.questions.slice(0, 40), activatable: FIELDS.filter((k) => ['perActionCapCents', 'hardMaxCents', 'dailyCapCents', 'hardDailyCapCents'].includes(k)).every((k) => draft.fields[k] != null) });
  });
  api.use('/author', author);
  // recorded live-sandbox proof; re-read from PayPal when this server has sandbox credentials
  api.get('/proof', async (_req, res) => {
    const rec = JSON.parse(readFileSync('server/fixtures/demo/live-sandbox.json', 'utf8'));
    const refunds = await Promise.all(rec.refunds.map(async (r: any) => {
      if (!d.paypal) return { ...r, live: null };
      try { const g = await d.paypal.getRefund(r.refund_id); return { ...r, live: { status: g.status, amount: g.amount?.value } }; } catch { return { ...r, live: { status: 'unavailable' } }; }
    }));
    res.json({ note: rec.note, mode: d.paypal ? 'LIVE-FIRE' : 'SIMULATED', refunds });
  });
  api.use('/demo', demoRouter(d));
  // read-only data for the approval page (the token is never needed or returned here)
  api.get('/approval/:id', async (req, res) => {
    const a = d.db.one<any>('SELECT a.id, a.amount_cents, a.rule_id, a.reason, a.status, ap.expires_at, ap.status aps FROM actions a JOIN approvals ap ON ap.action_id=a.id WHERE a.id=?', req.params.id);
    if (!a) return void res.status(404).json({ error: 'unknown_approval', bootId: BOOT_ID, why: 'This demo was reset after a server restart, or the link is wrong.' });
    const items = d.db.all<any>('SELECT oi.name, oi.unit_cents, ai.qty, oi.item_id FROM action_items ai JOIN order_items oi ON oi.order_id=ai.order_id AND oi.item_id=ai.item_id WHERE ai.action_id=?', a.id);
    let ai = summaries.get(a.id);
    if (ai === undefined) { ai = await aiSummary({ amountCents: a.amount_cents, ruleId: a.rule_id, ticket: tickets.get(a.id) ?? '' }, o.fetchImpl); if (ai) summaries.set(a.id, ai); }

    // Exchange-instead-of-refund suggestions from Channel3 (read-only evidence)
    let exchangeSuggestions: any[] = [];
    const targetItemId = items[0]?.item_id ?? d.db.one<{ item_id: string }>('SELECT item_id FROM action_items WHERE action_id=?', a.id)?.item_id;
    if (targetItemId) {
      exchangeSuggestions = await getSimilarProducts(targetItemId, { client: o.channel3Client });
    }

    res.json({
      aiGenerated: !!ai,
      actionId: a.id,
      amountCents: a.amount_cents,
      ruleId: a.rule_id,
      reason: a.reason,
      status: a.aps === 'pending' && Date.now() > a.expires_at ? 'expired' : a.aps,
      expiresAt: a.expires_at,
      items,
      exchangeSuggestions,
      bootId: BOOT_ID,
      summary: ai ?? `Advisory summary: the agent asks to refund ${items.map((i: any) => `${i.qty} x ${i.name}`).join(', ') || 'a payment'} ($${(a.amount_cents / 100).toFixed(2)}). That is above the $${(d.mandate.perActionCapCents / 100).toFixed(2)} the agent may refund alone, so it waits for you.`
    });
  });

  // --- Shop routes (Buyer-side purchases, Channel3 catalog, and buy->price-match->refund loop) ---
  api.get('/shop/products', async (req, res) => {
    const q = String(req.query.q ?? '');
    const category = req.query.category ? String(req.query.category) : undefined;
    const maxPriceCents = req.query.maxPriceCents ? Number(req.query.maxPriceCents) : undefined;
    const result = await searchProducts(q, {
      category,
      maxPriceCents,
      client: o.channel3Client,
      fetchImpl: o.fetchImpl,
    });
    res.json({
      query: q,
      count: result.products.length,
      source: result.source,
      products: result.products,
    });
  });

  api.get('/shop/products/:id', async (req, res) => {
    const result = await getProduct(req.params.id, { client: o.channel3Client });
    if (!result.product) {
      return void res.status(404).json({ error: 'product_not_found', source: result.source });
    }
    res.json({ product: result.product, source: result.source });
  });

  api.get('/shop/similar/:id', async (req, res) => {
    const similar = await getSimilarProducts(req.params.id, { client: o.channel3Client });
    res.json({ productId: req.params.id, similar });
  });

  api.post('/shop/purchase', async (req, res) => {
    const productId = String(req.body.productId ?? '').trim();
    if (!productId) {
      return void res.status(400).json({ error: 'missing_product_id', reason: 'productId is required' });
    }
    const qty = req.body.qty ? Number(req.body.qty) : 1;
    const sessionId = req.body.sessionId ? String(req.body.sessionId) : undefined;
    const agentId = req.body.agentId ? String(req.body.agentId) : undefined;
    const clientPriceCents = req.body.clientPriceCents ? Number(req.body.clientPriceCents) : undefined;

    const outcome = await runPurchase(d, {
      productId,
      qty,
      sessionId,
      agentId,
      channel3Client: o.channel3Client,
      clientPriceCents,
    });
    res.status(outcome.status === 'blocked' ? 403 : 200).json(outcome);
  });

  api.post('/shop/price-match', async (req, res) => {
    const captureId = String(req.body.captureId ?? '').trim();
    const itemId = String(req.body.itemId ?? '').trim();
    if (!captureId || !itemId) {
      return void res.status(400).json({ error: 'invalid_request', reason: 'captureId and itemId are required' });
    }
    const qty = req.body.qty ? Number(req.body.qty) : 1;
    const sessionId = req.body.sessionId ? String(req.body.sessionId) : undefined;
    const agentId = req.body.agentId ? String(req.body.agentId) : undefined;
    const parentActionId = req.body.parentActionId ? String(req.body.parentActionId) : undefined;

    const outcome = await runPriceMatch(d, {
      captureId,
      itemId,
      qty,
      sessionId,
      agentId,
      parentActionId,
      client: o.channel3Client,
    });
    res.status(outcome.status === 'blocked' ? 403 : outcome.status === 'unavailable' ? 400 : 200).json(outcome);
  });

  api.post('/shop/loop', async (req, res) => {
    const productId = req.body.productId ? String(req.body.productId) : undefined;
    const sessionId = req.body.sessionId ? String(req.body.sessionId) : undefined;
    const agentId = req.body.agentId ? String(req.body.agentId) : undefined;

    const loopResult = await runShoppingLoop(d, {
      productId,
      sessionId,
      agentId,
      channel3Client: o.channel3Client,
    });
    res.json(loopResult);
  });
  // PayPal webhook receiver (PAYMENT.CAPTURE.REFUNDED, CUSTOMER.DISPUTE.CREATED)
  api.post('/webhooks/paypal', async (req, res) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const event = req.body;

    // NEVER accept an unverified event if PAYPAL_WEBHOOK_ID is set
    if (webhookId) {
      // If webhook ID is set but no PayPal client, reject
      if (!d.paypal) {
        return void res.status(503).json({ error: 'webhook_misconfigured', reason: 'PAYPAL_WEBHOOK_ID set but no PayPal client configured' });
      }

      // Verify signature when webhook ID is set
      if (!event || !event.event_type) return void res.status(400).json({ error: 'invalid_webhook' });

      const headers: Record<string, string> = {};
      for (const key of ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig']) {
        const val = req.get(key);
        if (val) headers[key] = val;
      }

      const verified = await d.paypal.verifyWebhookSignature(webhookId, headers, event);
      if (!verified) {
        console.error(`❌ Webhook signature verification FAILED for event ${event.id}`);
        return void res.status(401).json({ error: 'invalid_signature' });
      }
      console.log(`✓ Webhook signature verified: ${event.event_type} ${event.id}`);
    } else {
      // No webhook ID set: reject unless explicitly allowed for local tests
      if (process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS !== '1') {
        return void res.status(503).json({ error: 'webhook_disabled', reason: 'PAYPAL_WEBHOOK_ID not configured' });
      }
      // Only accept unsigned webhooks with explicit opt-in
      console.warn('⚠️  Accepting unsigned webhook (REIN_ALLOW_UNSIGNED_WEBHOOKS=1)');
      if (!event || !event.event_type) return void res.status(400).json({ error: 'invalid_webhook' });
    }

    console.log(`Webhook received: ${event.event_type} ${event.id || ''}`);

    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      // Reconcile refund with custom_id = actionId
      const refundId = event.resource?.id;
      const customId = event.resource?.custom_id;
      if (refundId && customId) {
        // Find action by ID and settle if it was reserved (not unknown_outcome)
        const action = d.db.one<{ status: string }>('SELECT status FROM actions WHERE id=?', customId);
        if (action && action.status === 'reserved') {
          result(d.db, { actionId: customId, outcome: 'executed', refundId }, Date.now(), d.paypal ? 'live' : 'sim');
          console.log(`Reconciled reserved ${customId} -> executed (${refundId})`);
        }
      }
    } else if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
      // Log dispute creation (future: could auto-update dispute status for pending approvals)
      const txnId = event.resource?.disputed_transactions?.[0]?.seller_transaction_id;
      console.log(`Dispute created for transaction ${txnId || 'unknown'}`);
    }

    res.json({ received: true });
  });

  // Attack lab: run vectors through gate
  api.post('/attack-lab/run', async (req, res) => {
    const { vectorId, captureId } = req.body;
    if (typeof vectorId !== 'number' || typeof captureId !== 'string') {
      return void res.status(400).json({ error: 'bad_request' });
    }

    try {
      const { runAttackVector } = await import('./attack-lab.ts');
      const result = await runAttackVector(d, vectorId, captureId);
      res.json(result);
    } catch (err: any) {
      console.error('attack-lab error', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Beat the Gate challenge (uses separate in-memory database for isolation)
  let challengeDb: Db | null = o.challengeDb ?? null;
  async function getChallengeDb(): Promise<Db> {
    if (!challengeDb) {
      challengeDb = await openDb(':memory:');
      applySchema(challengeDb);
      initChallengeSchema(challengeDb);
    } else {
      // Ensure schema is initialized even for injected DB
      try { initChallengeSchema(challengeDb); } catch {}
    }
    return challengeDb;
  }

  api.get('/challenge/leaderboard', async (req, res) => {
    const cdb = await getChallengeDb();
    res.json(getLeaderboard(cdb, 50));
  });

  api.post('/challenge/attempt', rateLimit(10), async (req, res) => {
    const cdb = await getChallengeDb();

    if (isKillSwitchActive()) {
      return void res.status(503).json({ error: 'challenge_disabled', reason: 'The challenge is temporarily disabled.' });
    }

    const ip = (req.ip || req.socket.remoteAddress || '0.0.0.0').slice(0, 64);
    const now = Date.now();
    const rateCheck = checkRateLimit(cdb, ip, now);

    if (!rateCheck.allowed) {
      return void res.status(429).json({ error: 'rate_limit', remaining: rateCheck.remaining, retryAfter: 3600 });
    }

    // Check daily token budget
    const { getDailyTokensUsed, getDailyTokenBudget } = await import('./beat-the-gate.ts');
    const tokensUsedToday = getDailyTokensUsed(cdb, now);
    const dailyBudget = getDailyTokenBudget();
    if (tokensUsedToday >= dailyBudget) {
      return void res.status(503).json({ error: 'budget_exhausted', reason: 'Daily token budget exhausted. Try again tomorrow.' });
    }

    const message = String(req.body.message || '').slice(0, 2000);
    if (!message.trim()) {
      return void res.status(400).json({ error: 'invalid_input', fix: 'Send a message.' });
    }

    // Use recorded fallback if no API key
    if (!hasApiKey() && !o.challengeClient) {
      const recorded = getRecordedAttempt(Math.floor(Math.random() * 3));
      const id = recordAttempt(cdb, {
        ip,
        message,
        agentResponse: recorded.agentResponse,
        toolCalls: recorded.toolCalls,
        gateDecision: recorded.gateDecision,
        gateRule: recorded.gateRule,
        requestedCents: recorded.requestedCents,
        refundedCents: recorded.refundedCents,
        savedCents: recorded.savedCents,
        lostCents: recorded.lostCents,
        mode: 'recorded',
      });
      return res.json({
        id,
        mode: 'recorded',
        synthetic: true,
        agentResponse: recorded.agentResponse,
        toolCalls: recorded.toolCalls,
        gateDecision: recorded.gateDecision,
        gateRule: recorded.gateRule,
        requestedCents: recorded.requestedCents,
        refundedCents: recorded.refundedCents,
        savedCents: recorded.savedCents,
        lostCents: recorded.lostCents,
      });
    }

    // Live agent with Anthropic API
    try {
      const { runLiveAgent } = await import('./challenge-agent.ts');
      const { createFreshChallengeCapture } = await import('./challenge-seed.ts');
      const captureId = createFreshChallengeCapture(cdb);

      // Create isolated GateDeps for challenge (separate DB, no PayPal, no notifications, fixed mandate)
      const { CHALLENGE_MANDATE } = await import('./beat-the-gate.ts');
      const challengeDeps: GateDeps = {
        db: cdb,
        mandate: CHALLENGE_MANDATE,
        paypal: null, // Always simulated mode
        now: () => Date.now(),
      };

      const result = await runLiveAgent(challengeDeps, message, captureId, process.env.ANTHROPIC_API_KEY, { client: o.challengeClient });

      const savedCents = result.gateDecision === 'blocked' || result.gateDecision === 'escalated'
        ? result.requestedCents
        : 0;
      const lostCents = result.gateDecision === 'allowed' ? result.refundedCents : 0;

      const id = recordAttempt(cdb, {
        ip,
        message,
        agentResponse: result.response,
        toolCalls: result.toolCalls,
        gateDecision: result.gateDecision,
        gateRule: result.gateRule,
        requestedCents: result.requestedCents,
        refundedCents: result.refundedCents,
        savedCents,
        lostCents,
        mode: 'live',
        tokensUsed: result.tokensUsed,
      });

      res.json({
        id,
        mode: 'live',
        agentResponse: result.response,
        toolCalls: result.toolCalls,
        gateDecision: result.gateDecision,
        gateRule: result.gateRule,
        requestedCents: result.requestedCents,
        refundedCents: result.refundedCents,
        savedCents,
        lostCents,
        tokensUsed: result.tokensUsed,
      });
    } catch (e: any) {
      console.error('Live agent error:', e);
      // Fallback to recorded on error
      const recorded = getRecordedAttempt(Math.floor(Math.random() * 3));
      const id = recordAttempt(cdb, {
        ip,
        message,
        agentResponse: recorded.agentResponse,
        toolCalls: recorded.toolCalls,
        gateDecision: recorded.gateDecision,
        gateRule: recorded.gateRule,
        requestedCents: recorded.requestedCents,
        refundedCents: recorded.refundedCents,
        savedCents: recorded.savedCents,
        lostCents: recorded.lostCents,
        mode: 'recorded',
      });

      res.json({
        id,
        mode: 'recorded',
        error: 'Agent execution failed, using fallback',
        agentResponse: recorded.agentResponse,
        toolCalls: recorded.toolCalls,
        gateDecision: recorded.gateDecision,
        gateRule: recorded.gateRule,
        savedCents: recorded.savedCents,
        lostCents: recorded.lostCents,
      });
    }
  });

  // Health & readiness probes inside API
  api.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), mode: d.paypal ? 'live' : 'sim' });
  });
  api.get('/readyz', (_req, res) => {
    try {
      d.db.val('SELECT 1');
      res.json({ status: 'ready', db: 'ok', mode: d.paypal ? 'live' : 'sim', uptime: process.uptime() });
    } catch (e: any) {
      res.status(503).json({ status: 'not_ready', error: e?.message ?? 'Database check failed' });
    }
  });

  // Workflow reconciliation (idempotent unknown_outcome reconciler)
  api.post('/workflow/reconcile', async (_req, res) => {
    const now = Date.now();
    sweep(d.db, now);

    const unknowns = d.db.all<{ id: string; capture_id: string; amount_cents: number; tool: string; action_type: string; refund_id: string | null }>(
      `SELECT id, capture_id, amount_cents, tool, action_type, refund_id FROM actions WHERE status='unknown_outcome'`
    );

    let reconciledCount = 0;
    for (const act of unknowns) {
      const mode = d.paypal ? 'live' : 'sim';
      const isRefund = act.action_type === 'refund';
      
      if (d.paypal && isRefund) {
        // unknown_outcome means response was lost, so refund_id may not exist
        // Try to look up the refund by custom_id through the order
        try {
          let refundId = act.refund_id;
          let refundStatus: { status: string } | null = null;

          if (refundId) {
            // We have a refund_id, check its status directly
            refundStatus = await d.paypal.getRefund(refundId);
          } else if (act.capture_id) {
            // No refund_id: look up refund via order by custom_id (action_id)
            // First get the order_id for this capture
            const orderRow = d.db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', act.capture_id);
            if (orderRow) {
              const orderData = await d.paypal.getOrder(orderRow.order_id);
              // Find refunds in purchase_units[].payments.refunds[] matching our capture and custom_id
              for (const unit of orderData.purchase_units ?? []) {
                const refunds = unit.payments?.refunds ?? [];
                const matchingRefund = refunds.find((r) => r.custom_id === act.id);
                if (matchingRefund) {
                  refundId = matchingRefund.id;
                  refundStatus = matchingRefund;
                  // Update action with discovered refund_id
                  d.db.run('UPDATE actions SET refund_id=? WHERE id=?', refundId, act.id);
                  break;
                }
              }
            }
            // If not found, leave as unknown_outcome (human review needed)
          }

          if (refundStatus) {
            // PayPal refund statuses: COMPLETED, PENDING, FAILED, CANCELLED
            if (refundStatus.status === 'COMPLETED') {
              d.db.run('UPDATE payments SET reserved_cents=MAX(0, reserved_cents-?), refunded_cents=refunded_cents+? WHERE txn_id=?', act.amount_cents, act.amount_cents, act.capture_id);
              d.db.run(`UPDATE actions SET status='executed', updated_at=? WHERE id=?`, now, act.id);
              const { ledger } = await import('./ledger.ts');
              ledger(d.db, act.id, 'reconciled_executed', { mode }, now);
              reconciledCount++;
            } else if (refundStatus.status === 'FAILED' || refundStatus.status === 'CANCELLED') {
              d.db.run('UPDATE payments SET reserved_cents=MAX(0, reserved_cents-?) WHERE txn_id=?', act.amount_cents, act.capture_id);
              d.db.run(`UPDATE actions SET status='execution_failed', updated_at=? WHERE id=?`, now, act.id);
              const { ledger } = await import('./ledger.ts');
              ledger(d.db, act.id, 'reconciled_failed', { mode }, now);
              reconciledCount++;
            }
            // PENDING stays as unknown_outcome until it completes
          }
          // If refundStatus is null (not found), keep as unknown_outcome
        } catch {
          // Lookup error: keep as unknown_outcome
        }
      } else if (!d.paypal) {
        // Simulated mode: settle all to executed
        if (isRefund && act.capture_id) {
          d.db.run('UPDATE payments SET reserved_cents=MAX(0, reserved_cents-?), refunded_cents=refunded_cents+? WHERE txn_id=?', act.amount_cents, act.amount_cents, act.capture_id);
        }
        d.db.run(`UPDATE actions SET status='executed', updated_at=? WHERE id=?`, now, act.id);
        const { ledger } = await import('./ledger.ts');
        ledger(d.db, act.id, 'reconciled_executed', { mode }, now);
        reconciledCount++;
      }
      // else: action stays as unknown_outcome until we can verify it
    }

    const remainingUnknowns = d.db.val<number>(
      `SELECT COUNT(*) FROM actions WHERE status='unknown_outcome'`
    ) ?? 0;

    res.json({
      ok: true,
      reconciled: reconciledCount,
      unknownCount: remainingUnknowns,
      timestamp: now,
      idempotent: true,
    });
  });

  // Workflow Attack Lab (idempotent parallel test runner)
  api.post('/workflow/attack-lab/run', async (_req, res) => {
    const { seedAttackLabData, runAttackVector, ATTACK_VECTORS } = await import('./attack-lab.ts');
    const { captureIds } = seedAttackLabData(d.db);
    const results: any[] = [];

    for (const vec of ATTACK_VECTORS) {
      try {
        const capId = captureIds[vec.id] ?? 'ATTACK-DEFAULT';
        const r = await runAttackVector(d, vec.id, capId);
        results.push(r);
      } catch (err: any) {
        results.push({
          vectorId: vec.id,
          vector: vec.vector,
          error: err.message,
          blocked: false,
          escalated: false,
          allowed: false,
        });
      }
    }

    res.json({
      ok: true,
      vectorsRun: results.length,
      blockedCount: results.filter((r) => r.blocked).length,
      escalatedCount: results.filter((r) => r.escalated).length,
      allowedCount: results.filter((r) => r.allowed).length,
      timestamp: Date.now(),
      idempotent: true,
      results,
    });
  });

  api.use((_req, res) => void res.status(404).json({ error: 'not_found' })); // an unknown /v1 path must never fall through to the SPA
  app.use('/v1', api);
  app.get('/health', (_req, res) => void res.json({ ok: true, mode: d.paypal ? 'live' : 'sim' }));
  app.get('/healthz', (_req, res) => void res.json({ status: 'ok', uptime: process.uptime(), mode: d.paypal ? 'live' : 'sim' }));
  app.get('/readyz', (_req, res) => {
    try {
      d.db.val('SELECT 1');
      res.json({ status: 'ready', db: 'ok', mode: d.paypal ? 'live' : 'sim', uptime: process.uptime() });
    } catch (e: any) {
      res.status(503).json({ status: 'not_ready', error: e?.message ?? 'Database check failed' });
    }
  });

  app.use((e: any, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ReinBusyError || isBusy(e)) return void res.status(503).set('Retry-After', '1').json({ error: 'busy', fix: 'Retry in a moment.' });
    if (e?.type === 'entity.too.large' || e?.status === 400) return void res.status(400).json({ error: 'bad_request' });
    console.error('unhandled', e?.code ?? e?.name, e?.message);
    res.status(500).json({ error: 'internal' });
  });
  return app;
}

export { sweep };
