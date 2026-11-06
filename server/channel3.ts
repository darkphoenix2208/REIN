// Channel3 integration: price_adjust tool for MCP proxy and R-PRICE-ANOMALY policy rule.
// Pure computation function + optional live Channel3 API fallback (recorded for keyless demo).

export interface PriceCheckResult {
  itemId: string;
  captureId: string;
  ourPriceCents: number;
  marketPriceCents: number | null; // null when lookup fails or Channel3 unavailable
  anomaly: boolean; // true when marketPrice exists and differs by >10%
  source: 'live' | 'recorded' | 'unavailable';
}

/**
 * Pure price anomaly detector. Compares our price against market price.
 * Anomaly threshold: market price differs by >10% (e.g. we charged $100, market is $80 → 20% cheaper elsewhere).
 */
export function detectPriceAnomaly(ourPriceCents: number, marketPriceCents: number | null): boolean {
  if (marketPriceCents === null || ourPriceCents === 0) return false;
  const diff = Math.abs(ourPriceCents - marketPriceCents);
  const threshold = Math.max(ourPriceCents, marketPriceCents) * 0.10;
  return diff > threshold;
}

/**
 * Check price for an item against market data. Three modes:
 * 1. Live: CHANNEL3_API_KEY set → calls Channel3 Product API
 * 2. Recorded: keyless + known item → returns recorded demo data
 * 3. Unavailable: keyless + unknown item → returns null market price (policy escalates)
 */
export async function checkPrice(
  captureId: string,
  itemId: string,
  ourPriceCents: number,
  fetchImpl: typeof fetch = fetch
): Promise<PriceCheckResult> {
  const apiKey = process.env.CHANNEL3_API_KEY;

  // Recorded demo data (Coffee Mug from ticket 4)
  const RECORDED: Record<string, number> = {
    'mug': 1500, // $15.00 market price vs $18.00 our price = 16.7% cheaper elsewhere
  };

  let marketPriceCents: number | null = null;
  let source: 'live' | 'recorded' | 'unavailable' = 'unavailable';

  if (apiKey) {
    // Live Channel3 lookup
    try {
      const r = await fetchImpl('https://api.channel3.com/v1/products/price-check', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: itemId }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = await r.json() as { price_cents?: number };
        if (typeof data.price_cents === 'number') {
          marketPriceCents = data.price_cents;
          source = 'live';
        }
      }
    } catch {
      // Channel3 unavailable → fall through to recorded/unavailable
    }
  }

  // Fallback to recorded data if not live
  if (source === 'unavailable' && itemId in RECORDED) {
    const recorded = RECORDED[itemId];
    if (recorded !== undefined) {
      marketPriceCents = recorded;
      source = 'recorded';
    }
  }

  return {
    itemId,
    captureId,
    ourPriceCents,
    marketPriceCents: marketPriceCents ?? null,
    anomaly: detectPriceAnomaly(ourPriceCents, marketPriceCents),
    source,
  };
}
