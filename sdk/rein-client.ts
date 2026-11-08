/**
 * Rein TypeScript SDK Client
 * 
 * A lightweight, type-safe client for the Rein API.
 * Generated from OpenAPI 3.1 spec with manual refinements.
 */

export interface ReinConfig {
  baseUrl: string;
  bearerToken?: string;
  timeout?: number;
}

export interface CheckRequest {
  tool: string;
  payload: Record<string, any>;
}

export interface CheckResponse {
  decision: 'allowed' | 'pending_approval' | 'blocked';
  ruleId: string;
  reason: string;
  actionId?: string;
  approvalRequired?: boolean;
}

export interface ApprovalRequest {
  actionId: string;
  approved: boolean;
  approverEmail: string;
}

export interface LedgerRow {
  seq: number;
  hash: string;
  parentHash: string;
  tool: string;
  decision: string;
  ruleId: string;
  timestamp: number;
}

export interface Checkpoint {
  seq: number;
  head: string;
  timestamp: number;
  publicKey: string;
  signature: string;
}

export interface ChallengeAttempt {
  message: string;
}

export interface ChallengeResponse {
  allowed: boolean;
  attempt: any;
  mode: 'live' | 'recorded';
  gateDecision?: CheckResponse;
}

export class ReinClient {
  private config: Required<ReinConfig>;

  constructor(config: ReinConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      bearerToken: config.bearerToken ?? '',
      timeout: config.timeout ?? 30000,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    requiresAuth: boolean = false
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth && this.config.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'unknown' }));
        throw new Error(`Rein API Error ${response.status}: ${JSON.stringify(error)}`);
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Public endpoints

  async check(request: CheckRequest): Promise<CheckResponse> {
    return this.request('POST', '/v1/check', request, false);
  }

  async getLedger(limit: number = 100): Promise<LedgerRow[]> {
    return this.request('GET', `/v1/ledger?limit=${limit}`, undefined, false);
  }

  async getCheckpoint(): Promise<Checkpoint> {
    return this.request('GET', '/v1/ledger/checkpoint', undefined, false);
  }

  async verifyCheckpoint(checkpoint: Checkpoint): Promise<{ valid: boolean }> {
    return this.request('POST', '/v1/ledger/verify', checkpoint, false);
  }

  async getChallengeLeaderboard(): Promise<any> {
    return this.request('GET', '/v1/challenge/leaderboard', undefined, false);
  }

  async submitChallengeAttempt(attempt: ChallengeAttempt): Promise<ChallengeResponse> {
    return this.request('POST', '/v1/challenge/attempt', attempt, false);
  }

  // Authenticated endpoints

  async result(actionId: string, approved: boolean, approverEmail: string): Promise<any> {
    const request: ApprovalRequest = { actionId, approved, approverEmail };
    return this.request('POST', '/v1/result', request, true);
  }

  async getMandate(): Promise<any> {
    return this.request('GET', '/v1/mandate', undefined, true);
  }

  async backtest(candidate: any): Promise<any> {
    return this.request('POST', '/v1/mandate/backtest', { candidate }, true);
  }

  async getOps(): Promise<any> {
    return this.request('GET', '/v1/ops', undefined, true);
  }

  async getExposure(): Promise<any> {
    return this.request('GET', '/v1/exposure', undefined, true);
  }
}

// Convenience factory function
export function createClient(config: ReinConfig): ReinClient {
  return new ReinClient(config);
}
