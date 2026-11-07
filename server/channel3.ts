// Channel3 integration: product search, pricing intelligence, and market anomaly detection.
// Supports injected client, live Channel3 API, and clearly labeled recorded fallback.

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  inStock: boolean;
  competitors?: Array<{ store: string; priceCents: number; url: string }>;
  similarProductIds?: string[];
}

export interface PriceCheckResult {
  itemId: string;
  captureId: string;
  ourPriceCents: number;
  marketPriceCents: number | null;
  anomaly: boolean;
  source: 'live' | 'recorded' | 'unavailable';
}

export interface Channel3Client {
  searchProducts(query: string, options?: { category?: string; maxPriceCents?: number }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getSimilarProducts(id: string): Promise<Product[]>;
  checkPrice?(itemId: string, ourPriceCents: number): Promise<PriceCheckResult>;
}

export const RECORDED_CATALOG: Product[] = [
  {
    id: 'prod-mug',
    name: 'Ceramic Coffee Mug',
    description: '12oz handcrafted ceramic mug, dishwasher and microwave safe.',
    priceCents: 1800,
    currency: 'USD',
    category: 'kitchen',
    inStock: true,
    competitors: [
      { store: 'MugDepot', priceCents: 1500, url: 'https://mugdepot.example.com/mug' },
      { store: 'CoffeeRoastersCo', priceCents: 1650, url: 'https://coffeeroasters.example.com/mug' },
    ],
    similarProductIds: ['prod-tumbler', 'prod-espresso-cup'],
  },
  {
    id: 'prod-tumbler',
    name: 'Insulated Travel Tumbler',
    description: '16oz vacuum insulated stainless steel travel tumbler.',
    priceCents: 2200,
    currency: 'USD',
    category: 'kitchen',
    inStock: true,
    competitors: [{ store: 'HydroStore', priceCents: 2000, url: 'https://hydro.example.com' }],
    similarProductIds: ['prod-mug'],
  },
  {
    id: 'prod-espresso-cup',
    name: 'Espresso Demitasse Cup Set',
    description: 'Set of two 3oz porcelain espresso cups with saucers.',
    priceCents: 1400,
    currency: 'USD',
    category: 'kitchen',
    inStock: true,
    similarProductIds: ['prod-mug'],
  },
  {
    id: 'prod-chair',
    name: 'Ergonomic Mesh Chair',
    description: 'Breathable mesh executive task chair with lumbar support.',
    priceCents: 12000,
    currency: 'USD',
    category: 'furniture',
    inStock: true,
    competitors: [{ store: 'OfficeDiscount', priceCents: 9500, url: 'https://officediscount.example.com' }],
    similarProductIds: ['prod-stool'],
  },
  {
    id: 'prod-stool',
    name: 'Active Balance Stool',
    description: 'Wobble ergonomic stool for sit-to-stand desks.',
    priceCents: 8500,
    currency: 'USD',
    category: 'furniture',
    inStock: true,
    similarProductIds: ['prod-chair'],
  },
  {
    id: 'prod-kbd',
    name: 'Mechanical Keyboard TKL',
    description: 'Tenkeyless RGB mechanical keyboard with tactile switches.',
    priceCents: 7500,
    currency: 'USD',
    category: 'electronics',
    inStock: true,
    competitors: [{ store: 'KeyWorld', priceCents: 6500, url: 'https://keyworld.example.com' }],
  },
  {
    id: 'prod-dock',
    name: 'USB-C Docking Station',
    description: '8-in-1 USB-C hub with 4K HDMI, 100W PD, and Ethernet.',
    priceCents: 4500,
    currency: 'USD',
    category: 'electronics',
    inStock: true,
    competitors: [{ store: 'TechDepot', priceCents: 4000, url: 'https://techdepot.example.com' }],
  },
  {
    id: 'prod-giftcard',
    name: 'Digital Shopping Gift Card $50',
    description: 'Instant delivery digital gift card code.',
    priceCents: 5000,
    currency: 'USD',
    category: 'gift_cards',
    inStock: true,
  },
  {
    id: 'prod-crypto',
    name: 'Hardware Crypto Wallet',
    description: 'Cold storage security device for digital assets.',
    priceCents: 15000,
    currency: 'USD',
    category: 'crypto',
    inStock: true,
  },
];

/**
 * Pure price anomaly detector. Compares our price against market price.
 * Anomaly threshold: market price differs by >10%
 */
export function detectPriceAnomaly(ourPriceCents: number, marketPriceCents: number | null): boolean {
  if (marketPriceCents === null || ourPriceCents === 0) return false;
  const diff = Math.abs(ourPriceCents - marketPriceCents);
  const threshold = Math.max(ourPriceCents, marketPriceCents) * 0.10;
  return diff > threshold;
}

/**
 * Pure price difference calculation. Returns how much cheaper the market price is than our price.
 */
export function computePriceMatchDifference(ourPriceCents: number, marketPriceCents: number): number {
  if (marketPriceCents >= ourPriceCents) return 0;
  return ourPriceCents - marketPriceCents;
}

/**
 * Search products via Channel3.
 * Prioritizes injected client, then live Channel3 API if key is present,
 * and falls back to recorded catalog with clear source labeling.
 */
export async function searchProducts(
  query: string,
  options?: {
    category?: string;
    maxPriceCents?: number;
    client?: Channel3Client;
    fetchImpl?: typeof fetch;
  }
): Promise<{ products: Product[]; source: 'live' | 'recorded' | 'unavailable' }> {
  // 1. Injected client
  if (options?.client) {
    try {
      const prods = await options.client.searchProducts(query, {
        category: options.category,
        maxPriceCents: options.maxPriceCents,
      });
      return { products: prods, source: 'live' };
    } catch {
      return { products: [], source: 'unavailable' };
    }
  }

  // 2. Live API
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (apiKey) {
    const fetchFn = options?.fetchImpl ?? fetch;
    try {
      const url = new URL('https://api.channel3.com/v1/products/search');
      url.searchParams.set('q', query);
      if (options?.category) url.searchParams.set('category', options.category);
      const res = await fetchFn(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (Array.isArray(data.products)) {
          return { products: data.products, source: 'live' };
        }
      }
    } catch {
      // Fall through to recorded
    }
  }

  // 3. Recorded fallback
  const q = query.trim().toLowerCase();
  let matches = RECORDED_CATALOG.filter((p) => {
    const textMatch = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    const catMatch = !options?.category || p.category.toLowerCase() === options.category.toLowerCase();
    const priceMatch = !options?.maxPriceCents || p.priceCents <= options.maxPriceCents;
    return textMatch && catMatch && priceMatch;
  });

  return { products: matches, source: 'recorded' };
}

/**
 * Get product by ID.
 */
export async function getProduct(
  id: string,
  options?: { client?: Channel3Client }
): Promise<{ product: Product | null; source: 'live' | 'recorded' | 'unavailable' }> {
  if (options?.client) {
    try {
      const p = await options.client.getProduct(id);
      return { product: p, source: p ? 'live' : 'unavailable' };
    } catch {
      return { product: null, source: 'unavailable' };
    }
  }

  const p = RECORDED_CATALOG.find((x) => x.id === id || x.id === `prod-${id}`);
  if (p) return { product: p, source: 'recorded' };
  return { product: null, source: 'unavailable' };
}

/**
 * Get similar products for exchange-instead-of-refund recommendations.
 */
export async function getSimilarProducts(
  id: string,
  options?: { client?: Channel3Client }
): Promise<Product[]> {
  if (options?.client) {
    try {
      return await options.client.getSimilarProducts(id);
    } catch {
      return [];
    }
  }

  const target = RECORDED_CATALOG.find((x) => x.id === id || x.id === `prod-${id}`);
  if (!target) return [];

  if (target.similarProductIds && target.similarProductIds.length > 0) {
    return RECORDED_CATALOG.filter((p) => target.similarProductIds!.includes(p.id));
  }

  // Fallback: items in the same category
  return RECORDED_CATALOG.filter((p) => p.category === target.category && p.id !== target.id);
}

/**
 * Check price for an item against market data.
 */
export async function checkPrice(
  captureId: string,
  itemId: string,
  ourPriceCents: number,
  fetchImpl: typeof fetch = fetch,
  client?: Channel3Client
): Promise<PriceCheckResult> {
  if (client?.checkPrice) {
    return client.checkPrice(itemId, ourPriceCents);
  }

  const apiKey = process.env.CHANNEL3_API_KEY;
  let marketPriceCents: number | null = null;
  let source: 'live' | 'recorded' | 'unavailable' = 'unavailable';

  if (apiKey) {
    try {
      const r = await fetchImpl('https://api.channel3.com/v1/products/price-check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: itemId }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = (await r.json()) as { price_cents?: number };
        if (typeof data.price_cents === 'number') {
          marketPriceCents = data.price_cents;
          source = 'live';
        }
      }
    } catch {
      // Fall through
    }
  }

  if (source === 'unavailable') {
    const prod = RECORDED_CATALOG.find((p) => p.id === itemId || p.id === `prod-${itemId}`);
    if (prod?.competitors && prod.competitors.length > 0 && prod.competitors[0]) {
      marketPriceCents = prod.competitors[0].priceCents;
      source = 'recorded';
    } else if (itemId === 'mug') {
      marketPriceCents = 1500;
      source = 'recorded';
    }
  }

  return {
    itemId,
    captureId,
    ourPriceCents,
    marketPriceCents,
    anomaly: detectPriceAnomaly(ourPriceCents, marketPriceCents),
    source,
  };
}
