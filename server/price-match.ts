// Price-match refund computation: pure functions for computing adjustment amounts
import type { Db } from './db.ts';
import { checkPrice, type PriceCheckResult } from './channel3.ts';

export interface PriceMatchResult {
  ok: boolean;
  adjustmentCents: number; // Amount to refund (our_price - market_price)
  ourPriceCents: number;
  marketPriceCents: number | null;
  confidence: 'high' | 'low' | 'unavailable';
  source: 'live' | 'recorded' | 'unavailable';
  error?: string;
}

/**
 * Compute price-match refund amount.
 *
 * Pure function: adjustment = our_unit_price - lowest_verified_market_price
 *
 * Rules:
 * - If market price unavailable or low confidence → error (escalate via R-STATE-UNAVAILABLE)
 * - If our price <= market price → no adjustment needed (adjustment = 0)
 * - If our price > market price → refund difference per unit
 */
export function computePriceMatchAdjustment(
  ourPriceCents: number,
  marketPriceCents: number | null,
  confidence: 'high' | 'low' | 'unavailable'
): PriceMatchResult {
  // Lookup failure or low confidence → escalate
  if (confidence === 'unavailable' || confidence === 'low') {
    return {
      ok: false,
      adjustmentCents: 0,
      ourPriceCents,
      marketPriceCents,
      confidence,
      source: 'unavailable',
      error: confidence === 'low' ? 'Low confidence market data' : 'Market price unavailable',
    };
  }

  if (marketPriceCents === null) {
    return {
      ok: false,
      adjustmentCents: 0,
      ourPriceCents,
      marketPriceCents: null,
      confidence,
      source: 'unavailable',
      error: 'Market price is null',
    };
  }

  // Our price <= market price → no adjustment
  if (ourPriceCents <= marketPriceCents) {
    return {
      ok: true,
      adjustmentCents: 0,
      ourPriceCents,
      marketPriceCents,
      confidence,
      source: 'live', // Assume high confidence means live
    };
  }

  // Our price > market price → refund difference
  const adjustment = ourPriceCents - marketPriceCents;
  return {
    ok: true,
    adjustmentCents: adjustment,
    ourPriceCents,
    marketPriceCents,
    confidence,
    source: 'live',
  };
}

/**
 * Get price-match adjustment for an item in an order.
 * Looks up our price from order data, fetches market price from Channel3,
 * computes adjustment amount.
 */
export async function getPriceMatchAdjustment(
  db: Db,
  captureId: string,
  itemId: string,
  fetchImpl?: typeof fetch
): Promise<PriceMatchResult & { itemName?: string; qty?: number }> {
  // Get order data
  const order = db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', captureId);
  if (!order) {
    return {
      ok: false,
      adjustmentCents: 0,
      ourPriceCents: 0,
      marketPriceCents: null,
      confidence: 'unavailable',
      source: 'unavailable',
      error: 'Order not found',
    };
  }

  const item = db.one<{ name: string; unit_cents: number; qty: number }>(
    'SELECT name, unit_cents, qty FROM order_items WHERE order_id=? AND item_id=?',
    order.order_id,
    itemId
  );

  if (!item) {
    return {
      ok: false,
      adjustmentCents: 0,
      ourPriceCents: 0,
      marketPriceCents: null,
      confidence: 'unavailable',
      source: 'unavailable',
      error: 'Item not found in order',
    };
  }

  // Get market price from Channel3
  const priceCheck: PriceCheckResult = await checkPrice(captureId, itemId, item.unit_cents, fetchImpl);

  // Determine confidence based on source
  const confidence: 'high' | 'low' | 'unavailable' =
    priceCheck.source === 'live' ? 'high' :
    priceCheck.source === 'recorded' ? 'low' :
    'unavailable';

  const result = computePriceMatchAdjustment(item.unit_cents, priceCheck.marketPriceCents, confidence);

  return {
    ...result,
    itemName: item.name,
    qty: item.qty,
    source: priceCheck.source,
  };
}
