import { useEffect, useState } from 'react';
import { api, dollars, Chip } from './ui';

interface Product {
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

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<'live' | 'recorded' | 'unavailable'>('recorded');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loopLoading, setLoopLoading] = useState(false);
  const [loopResult, setLoopResult] = useState<any>(null);
  const [lastPurchase, setLastPurchase] = useState<any>(null);
  const [err, setErr] = useState('');

  const loadProducts = async (q = '') => {
    setLoading(true);
    setErr('');
    try {
      const res = await api(`/v1/shop/products?q=${encodeURIComponent(q)}`);
      setProducts(res.products ?? []);
      setSource(res.source ?? 'recorded');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleBuy = async (productId: string) => {
    setErr('');
    setLastPurchase(null);
    try {
      const res = await api('/v1/shop/purchase', { productId, qty: 1 });
      setLastPurchase(res);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleRunLoop = async (productId = 'prod-mug') => {
    setLoopLoading(true);
    setErr('');
    setLoopResult(null);
    try {
      const res = await api('/v1/shop/loop', { productId });
      setLoopResult(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoopLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 112, 186, 0.1)', color: 'var(--blue)', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid rgba(0, 112, 186, 0.2)' }}>
        <span>🛒 BUYER-SIDE AGENT</span>
        <span>•</span>
        <span>Channel3 Price Intelligence & Gate Caps</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', margin: '0 0 var(--space-xs) 0', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Autonomous Shopping & Channel3
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '15px' }}>
            Autonomous shopping agent with Channel3 price intelligence and Rein gate-enforced spend limits.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <span className={`chip ${source === 'live' ? 'chip-live' : 'chip-simulated'}`}>
            Catalog: {source.toUpperCase()}
          </span>
          <span className="chip chip-simulated">SIMULATED PAYPAL</span>
        </div>
      </div>

      {/* Error State */}
      {err && (
        <div className="error-state" style={{ marginBottom: 'var(--space-lg)' }} role="alert">
          <p>{err}</p>
          <button className="btn btn-primary" onClick={() => loadProducts(query)}>
            Retry
          </button>
        </div>
      )}

      {/* Autonomous Loop Hero */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)', borderLeft: '4px solid var(--navy)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', margin: '0 0 var(--space-sm) 0', color: 'var(--text)' }}>
              The Complete Buyer Loop: Buy → Price-Match → Refund
            </h3>
            <p style={{ color: 'var(--muted)', margin: '0 0 var(--space-md) 0', maxWidth: '650px' }}>
              Watch an autonomous shopping agent find an item, checkout under mandate caps, discover a lower competitor price via Channel3, issue a gate-gated price-match refund, and refund the remainder. Every step forms a linked, verifiable ledger chain.
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={loopLoading}
            onClick={() => handleRunLoop('prod-mug')}
          >
            {loopLoading ? 'Running loop...' : 'Run Autonomous Loop'}
          </button>
        </div>

        {loopLoading && (
          <div className="loading" style={{ padding: 'var(--space-lg)' }}>
            <div className="spinner"></div>
          </div>
        )}

        {loopResult && (
          <div style={{ marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <span style={{ fontWeight: '600', color: loopResult.success ? 'var(--success)' : 'var(--danger)' }}>
                {loopResult.success ? '✓ Loop Completed Successfully' : '✕ Loop Halted'}
              </span>
              <span className="chip" style={{ fontSize: 'var(--font-size-sm)' }}>
                Ledger: {loopResult.chainResult.rows} rows (verified)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)' }}>
              {loopResult.steps.map((st: any, idx: number) => (
                <div key={idx} style={{ background: 'var(--background)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>
                    Step {idx + 1}
                  </div>
                  <div style={{ fontWeight: '600', fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-sm)', color: 'var(--text)' }}>
                    {st.name}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)' }}>
                    {st.step === '1_search' && (
                      <div>Found {st.result.count} items ({st.result.source})</div>
                    )}
                    {st.step === '2_purchase' && (
                      <div>
                        <div>Status: <span style={{ color: 'var(--success)', fontWeight: '600' }}>{st.result.status}</span></div>
                        <div className="numeric">Cap: {dollars(st.result.amountCents)} ({st.result.ruleId})</div>
                        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' }}>
                          {st.result.captureId}
                        </div>
                      </div>
                    )}
                    {st.step === '3_price_match' && (
                      <div>
                        <div className="numeric">Refund: <span style={{ color: 'var(--success)', fontWeight: '600' }}>{dollars(st.result.priceMatch?.adjustmentCents ?? 0)}</span></div>
                        <div className="numeric">Market: {dollars(st.result.priceMatch?.marketPriceCents ?? 0)}</div>
                        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 'var(--space-xs)' }}>
                          Difference vs our price
                        </div>
                      </div>
                    )}
                    {st.step === '4_refund' && (
                      <div>
                        <div className="numeric">Refunded: <span style={{ color: 'var(--success)', fontWeight: '600' }}>{dollars(st.result.amountCents)}</span></div>
                        <div>Balance settled</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
              Head Hash: {loopResult.chainResult.head}
            </div>
          </div>
        )}
      </div>

      {/* Manual Purchase Result Card */}
      {lastPurchase && (
        <div className={`card ${lastPurchase.status === 'executed' ? 'card-protected' : lastPurchase.status === 'blocked' ? 'card-vulnerable' : ''}`} style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h4 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text)' }}>
              Gate Purchase Decision
            </h4>
            {lastPurchase.status === 'executed' && <Chip kind="allow" />}
            {lastPurchase.status === 'blocked' && <Chip kind="block" />}
            {lastPurchase.status === 'pending_approval' && <Chip kind="escalate" />}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)' }}>
            <div><strong>Status:</strong> {lastPurchase.status} (Rule: <code>{lastPurchase.ruleId}</code>)</div>
            {lastPurchase.amountCents && <div className="numeric"><strong>Amount:</strong> {dollars(lastPurchase.amountCents)}</div>}
            {lastPurchase.orderId && <div><strong>Order ID:</strong> {lastPurchase.orderId}</div>}
            {lastPurchase.reason && <div><strong>Reason:</strong> {lastPurchase.reason}</div>}
            {lastPurchase.approvalUrl && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <a href={lastPurchase.approvalUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Open Approval Link →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalog Search & Grid */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search products (Channel3 catalog)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              loadProducts(e.target.value);
            }}
            style={{
              flex: 1,
              padding: 'var(--space-sm) var(--space-md)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              fontSize: 'var(--font-size-base)',
              fontFamily: 'var(--font-family)',
              minHeight: '44px'
            }}
          />
          <button className="btn btn-primary" onClick={() => loadProducts(query)}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="empty-state">
            <p>No products found. Try a different search.</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
          {products.map((prod) => {
            const competitor = prod.competitors?.[0];
            const isBlocked = prod.category === 'crypto' || prod.category === 'gift_cards';
            const isOverCap = prod.priceCents > 5000;

            return (
              <div
                key={prod.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: isBlocked ? `1px dashed var(--danger)` : `1px solid var(--border)`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: '600' }}>
                      {prod.category}
                    </span>
                    {isBlocked && (
                      <span className="chip chip-blocked" style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-xs) var(--space-sm)' }}>
                        BLOCKED
                      </span>
                    )}
                    {!isBlocked && isOverCap && (
                      <span className="chip chip-pending" style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-xs) var(--space-sm)' }}>
                        APPROVAL
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0 0 var(--space-xs) 0', fontSize: 'var(--font-size-lg)', fontWeight: '600', color: 'var(--text)' }}>
                    {prod.name}
                  </h3>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', margin: '0 0 var(--space-md) 0' }}>
                    {prod.description}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-sm)' }}>
                    <div className="numeric" style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', color: 'var(--navy)' }}>
                      {dollars(prod.priceCents)}
                    </div>
                    {competitor && (
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                        {competitor.store}: <span style={{ textDecoration: 'line-through' }}>{dollars(competitor.priceCents)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleBuy(prod.id)}
                    style={{ width: '100%' }}
                    disabled={isBlocked}
                  >
                    {isBlocked ? 'Policy Blocked' : 'Buy with Agent'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
