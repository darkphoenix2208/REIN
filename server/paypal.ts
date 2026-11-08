// The ONLY code that holds PayPal credentials. Sandbox only (refuses any other host). Injectable fetch for tests.
import type { ExternalState } from './types.ts';

export interface PayPalOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PayPalError extends Error {
  status: number;
  debugId: string | undefined;
  body: unknown;
  constructor(status: number, message: string, debugId?: string, body?: unknown) {
    super(message);
    this.name = 'PayPalError';
    this.status = status;
    this.debugId = debugId;
    this.body = body;
  }
}

export const toValue = (cents: number): string => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
export const toCents = (v: string): number | null => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0) : null;
};

export class PayPalClient {
  private token: string | null = null;
  private refreshing: Promise<string> | null = null;
  private readonly f: typeof fetch;
  private readonly timeoutMs: number;
  private readonly o: PayPalOptions;
  constructor(o: PayPalOptions) {
    this.o = o;
    if (!/sandbox/i.test(o.baseUrl)) throw new Error('Refusing to run against a non-sandbox PayPal URL.');
    this.f = o.fetchImpl ?? fetch;
    this.timeoutMs = o.timeoutMs ?? 10_000;
  }

  /** Never log or return this. Used so error text can be scrubbed. */
  scrub(s: unknown): string {
    let out = String(s);
    for (const secret of [this.token, this.o.clientSecret]) if (secret) out = out.split(secret).join('[redacted]');
    return out;
  }

  private async fetchToken(): Promise<string> {
    const r = await this.f(`${this.o.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${this.o.clientId}:${this.o.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!r.ok) throw new PayPalError(r.status, `PayPal token request failed (HTTP ${r.status}). Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox app).`);
    return ((await r.json()) as { access_token: string }).access_token;
  }

  /** single-flight: concurrent 401s trigger ONE refresh */
  private getToken(force = false): Promise<string> {
    if (!force && this.token) return Promise.resolve(this.token);
    this.refreshing ??= this.fetchToken()
      .then((t) => (this.token = t))
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async request<T = any>(method: string, path: string, opts: { body?: unknown; requestId?: string } = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(attempt > 0);
      const r = await this.f(`${this.o.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.requestId ? { 'PayPal-Request-Id': opts.requestId } : {}) },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (r.status === 401 && attempt === 0) continue; // refresh once
      const text = await r.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* leave null */ }
      if (!r.ok) throw new PayPalError(r.status, this.scrub(json?.message ?? json?.name ?? `HTTP ${r.status}`), r.headers.get('paypal-debug-id') ?? undefined, json);
      return json as T;
    }
    throw new PayPalError(401, 'PayPal rejected the token twice.');
  }

  getCapture = (id: string) => this.request<{ id: string; create_time?: string; status?: string; amount?: { value: string; currency_code: string } }>('GET', `/v2/payments/captures/${encodeURIComponent(id)}`);
  getRefund = (id: string) => this.request<{ id: string; status: string; amount?: { value: string; currency_code: string } }>('GET', `/v2/payments/refunds/${encodeURIComponent(id)}`);
  listDisputes = (txnId: string) => this.request<{ items?: { dispute_state?: string; status?: string }[] }>('GET', `/v1/customer/disputes?disputed_transaction_id=${encodeURIComponent(txnId)}`);
  
  /** Get order details including refunds via purchase_units[].payments.refunds[] */
  getOrder = (orderId: string) => this.request<{
    id: string;
    status: string;
    purchase_units?: Array<{
      reference_id?: string;
      payments?: {
        captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string } }>;
        refunds?: Array<{ id: string; status: string; custom_id?: string; amount?: { value: string; currency_code: string } }>;
      };
    }>;
  }>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);

  /** idempotent per requestId (the Rein action id). custom_id set to actionId for reconciliation. */
  refund(captureId: string, amountCents: number, currency: string, requestId: string, note?: string) {
    return this.request<{ id: string; status: string }>('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      requestId,
      body: { amount: { currency_code: currency, value: toValue(amountCents) }, custom_id: requestId, ...(note ? { note_to_payer: note } : {}) },
    });
  }

  /** Live state for the gate. Each field is null when its lookup fails (the policy then escalates, never allows). Runs BEFORE the DB transaction. */
  async readState(captureId: string): Promise<ExternalState> {
    const [cap, disp] = await Promise.allSettled([this.getCapture(captureId), this.listDisputes(captureId)]);
    const created = cap.status === 'fulfilled' && cap.value.create_time ? Date.parse(cap.value.create_time) : NaN;
    const open = disp.status === 'fulfilled' ? (disp.value.items ?? []).some((d) => (d.dispute_state ?? d.status) !== 'RESOLVED') : null;
    return { capturedAtMs: Number.isFinite(created) ? created : null, disputeOpen: open };
  }

  /** Verify webhook signature using PayPal's verify-webhook-signature API */
  async verifyWebhookSignature(webhookId: string, headers: Record<string, string>, body: any): Promise<boolean> {
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionTime = headers['paypal-transmission-time'];
    const certUrl = headers['paypal-cert-url'];
    const authAlgo = headers['paypal-auth-algo'];
    const transmissionSig = headers['paypal-transmission-sig'];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return false; // Missing required headers
    }

    try {
      const result = await this.request<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
        body: {
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: webhookId,
          webhook_event: body,
        },
      });
      return result.verification_status === 'SUCCESS';
    } catch {
      return false; // Verification failed
    }
  }
}
