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
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem 0' }}>Buyer-Side Agent & Shop</h1>
          <p className="muted" style={{ margin: 0 }}>
            Autonomous shopping agent with Channel3 price intelligence and Rein gate-enforced spend limits.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className="chip" style={{ background: source === 'live' ? '#ecfdf5' : '#eff6ff', color: source === 'live' ? '#047857' : '#1d4ed8' }}>
            Catalog: {source.toUpperCase()}
          </span>
          <span className="chip mode mode-sim">SIMULATED PAYPAL</span>
        </div>
      </div>

      {err && (
        <div className="banner error" role="alert" style={{ marginBottom: '1rem' }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {/* Autonomous Loop Hero */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #003087' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>The Complete Buyer Loop: Buy → Price-Match → Refund</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem 0', maxWidth: 650 }}>
              Watch an autonomous shopping agent find an item, checkout under mandate caps, discover a lower competitor price via Channel3, issue a gate-gated price-match refund, and refund the remainder. Every step forms a linked, verifiable ledger chain.
            </p>
          </div>
          <button
            className="btn"
            disabled={loopLoading}
            onClick={() => handleRunLoop('prod-mug')}
            style={{ padding: '0.6rem 1.2rem', fontSize: '0.95rem' }}
          >
            {loopLoading ? 'Running loop...' : 'Run Autonomous Loop'}
          </button>
        </div>

        {loopResult && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 600, color: loopResult.success ? '#059669' : '#dc2626' }}>
                {loopResult.success ? '✓ Loop Completed Successfully' : '✕ Loop Halted'}
              </span>
              <span className="chip" style={{ fontSize: '0.75rem' }}>
                Ledger: {loopResult.chainResult.rows} rows (verified)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {loopResult.steps.map((st: any, idx: number) => (
                <div key={idx} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                    Step {idx + 1}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', margin: '0.2rem 0 0.4rem 0' }}>
                    {st.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                    {st.step === '1_search' && (
                      <div>Found {st.result.count} items ({st.result.source})</div>
                    )}
                    {st.step === '2_purchase' && (
                      <div>
                        <div>Status: <span style={{ color: '#059669', fontWeight: 600 }}>{st.result.status}</span></div>
                        <div>Cap: {dollars(st.result.amountCents)} ({st.result.ruleId})</div>
                        <div className="mono" style={{ fontSize: '0.7rem' }}>{st.result.captureId}</div>
                      </div>
                    )}
                    {st.step === '3_price_match' && (
                      <div>
                        <div>Refund: <span style={{ color: '#059669', fontWeight: 600 }}>{dollars(st.result.priceMatch?.adjustmentCents ?? 0)}</span></div>
                        <div>Market: {dollars(st.result.priceMatch?.marketPriceCents ?? 0)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Difference vs our price</div>
                      </div>
                    )}
                    {st.step === '4_refund' && (
                      <div>
                        <div>Refunded: <span style={{ color: '#059669', fontWeight: 600 }}>{dollars(st.result.amountCents)}</span></div>
                        <div>Balance settled</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }} className="mono">
              Head Hash: {loopResult.chainResult.head}
            </div>
          </div>
        )}
      </div>

      {/* Manual Purchase Result Card */}
      {lastPurchase && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Gate Purchase Decision</h4>
            {lastPurchase.status === 'executed' && <Chip kind="allow" />}
            {lastPurchase.status === 'blocked' && <Chip kind="block" />}
            {lastPurchase.status === 'pending_approval' && <Chip kind="escalate" />}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.88rem' }}>
            <div><strong>Status:</strong> {lastPurchase.status} (Rule: {lastPurchase.ruleId})</div>
            {lastPurchase.amountCents && <div><strong>Amount:</strong> {dollars(lastPurchase.amountCents)}</div>}
            {lastPurchase.orderId && <div><strong>Order ID:</strong> {lastPurchase.orderId}</div>}
            {lastPurchase.reason && <div><strong>Reason:</strong> {lastPurchase.reason}</div>}
            {lastPurchase.approvalUrl && (
              <div style={{ marginTop: '0.5rem' }}>
                <a href={lastPurchase.approvalUrl} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                  Open Approval Link →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalog Search & Grid */}
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search products (Channel3 catalog)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              loadProducts(e.target.value);
            }}
            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          />
          <button className="btn" onClick={() => loadProducts(query)}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
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
                  border: isBlocked ? '1px dashed #fca5a5' : '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                      {prod.category}
                    </span>
                    {isBlocked && (
                      <span className="chip block" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        POLICY BLOCKED
                      </span>
                    )}
                    {!isBlocked && isOverCap && (
                      <span className="chip escalate" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        REQUIRES APPROVAL
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0.35rem 0 0.25rem 0', fontSize: '1.05rem' }}>{prod.name}</h3>
                  <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>
                    {prod.description}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#003087' }}>
                      {dollars(prod.priceCents)}
                    </div>
                    {competitor && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {competitor.store}: <span style={{ textDecoration: 'line-through' }}>{dollars(competitor.priceCents)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn"
                    onClick={() => handleBuy(prod.id)}
                    style={{ width: '100%', fontSize: '0.85rem', padding: '0.45rem' }}
                  >
                    Buy with Agent
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
