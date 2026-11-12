import { ReactNode, useEffect, useState } from 'react';
import { useTheme, ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
  mode?: 'SIMULATED' | 'LIVE';
  currentPath: string;
}

const navItems = [
  { id: 'demo', label: 'Demo', icon: '🎯', path: '/' },
  { id: 'shop', label: 'Shop', icon: '🛒', path: '/shop' },
  { id: 'challenge', label: 'Challenge', icon: '🎮', path: '/challenge' },
  { id: 'attack-lab', label: 'Attack Lab', icon: '⚡', path: '/attack-lab' },
  { id: 'ledger', label: 'Ledger', icon: '📊', path: '/ledger' },
  { id: 'ops', label: 'Ops', icon: '📈', path: '/ops' },
  { id: 'verify', label: 'Verify', icon: '✅', path: '/verify' },
  { id: 'mandate', label: 'Mandate', icon: '📜', path: '/mandate' },
  { id: 'author', label: 'Author', icon: '✍️', path: '/author' },
  { id: 'proof', label: 'Proof', icon: '🔬', path: '/proof' },
];

const BrandLogo = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <rect width="32" height="32" rx="8" fill="url(#brandGrad)" />
    <path d="M16 5C20.5 6.5 23.5 7 25 7.5C25.5 13.5 23.5 22 16 27.5C8.5 22 6.5 13.5 7 7.5C8.5 7 11.5 6.5 16 5Z" fill="url(#violetGrad)" />
    <path d="M12.5 11H17.8C19.5 11 20.8 12 20.8 13.8C20.8 15 20 16 18.8 16.4L21.5 21.5H18.8L16.4 17H14.8V21.5H12.5V11ZM14.8 15H17.3C18.2 15 18.7 14.6 18.7 13.8C18.7 12.9 18.2 12.5 17.3 12.5H14.8V15Z" fill="#ffffff" />
    <circle cx="21.5" cy="21.5" r="1.8" fill="#2DDF9B" />
    <defs>
      <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0B0D1B" />
        <stop offset="1" stopColor="#1E1B4B" />
      </linearGradient>
      <linearGradient id="violetGrad" x1="7" y1="5" x2="25" y2="27.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9B8CFF" />
        <stop offset="1" stopColor="#6847EF" />
      </linearGradient>
    </defs>
  </svg>
);

export function Layout({ children, mode = 'SIMULATED', currentPath }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [currentPath]);
  const primary = navItems.filter((i) => ['demo', 'shop', 'challenge', 'ledger'].includes(i.id));
  const more = navItems.filter((i) => !primary.includes(i));
  const moreActive = more.some((i) => i.path === currentPath);
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="layout">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BrandLogo />
            <span>Rein</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className={`chip chip-${mode.toLowerCase()}`}>{mode}</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={item.path}
              onClick={go(item.path)}
              className={`nav-link ${currentPath === item.path ? 'nav-link-active' : ''}`}
              aria-current={currentPath === item.path ? 'page' : undefined}
            >
              <span style={{ fontSize: '15px', marginRight: '10px' }} aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer" style={{ marginTop: 'auto', padding: 'var(--space-md)', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Rein v0.1.0</div>
          <div>PayPal AI Hackathon 2026</div>
          <a href="https://github.com/darkphoenix2208/REIN" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            GitHub Repository ↗
          </a>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="mobile-header">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BrandLogo />
          <span>Rein</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <span className={`chip chip-${mode.toLowerCase()}`}>{mode}</span>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs: 4 primary pages + More */}
      {moreOpen && (
        <div className="more-sheet" role="menu" aria-label="More pages">
          {more.map((item) => (
            <a key={item.id} href={item.path} onClick={go(item.path)} role="menuitem" className={`more-link ${currentPath === item.path ? 'more-link-active' : ''}`} aria-current={currentPath === item.path ? 'page' : undefined}>
              <span style={{ marginRight: '6px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      )}
      <nav className="bottom-tabs" aria-label="Primary navigation">
        {primary.map((item) => (
          <a
            key={item.id}
            href={item.path}
            onClick={go(item.path)}
            className={`tab-item ${currentPath === item.path ? 'tab-item-active' : ''}`}
            aria-current={currentPath === item.path ? 'page' : undefined}
          >
            <span style={{ fontSize: '16px' }} aria-hidden="true">{item.icon}</span>
            <span className="tab-label">{item.label}</span>
          </a>
        ))}
        <button type="button" className={`tab-item tab-more ${moreActive || moreOpen ? 'tab-item-active' : ''}`} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
          <span style={{ fontSize: '16px' }} aria-hidden="true">⋯</span>
          <span className="tab-label">More</span>
        </button>
      </nav>

      <style>{`
        /* Layout Container */
        .layout {
          display: flex;
          min-height: 100vh;
          background: var(--background);
        }

        /* Desktop Sidebar */
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 240px;
          background: var(--card-bg, #ffffff);
          border-right: 1px solid var(--border);
          display: none;
          flex-direction: column;
          z-index: 100;
          box-shadow: 1px 0 3px rgba(0, 0, 0, 0.03);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-lg);
          border-bottom: 1px solid var(--border);
        }

        .logo {
          font-size: var(--font-size-xl);
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
          margin: 0;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px;
          overflow-y: auto;
        }

        .nav-link {
          display: flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          color: var(--muted);
          text-decoration: none;
          font-weight: 500;
          font-size: var(--font-size-sm);
          transition: all var(--transition-fast);
          min-height: 40px;
        }

        .nav-link:hover {
          background: var(--background);
          color: var(--text);
        }

        .nav-link-active {
          background: linear-gradient(135deg, rgba(0, 112, 186, 0.12) 0%, rgba(0, 48, 135, 0.06) 100%);
          color: var(--blue);
          font-weight: 600;
          border-left: 3px solid var(--blue);
        }

        [data-theme="dark"] .nav-link-active {
          background: rgba(56, 189, 248, 0.12);
          color: var(--blue);
          border-left: 3px solid var(--blue);
        }

        .nav-link:focus-visible {
          outline: 2px solid var(--blue);
          outline-offset: 2px;
        }

        /* Mobile Header */
        .mobile-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: var(--card-bg, #ffffff);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md) var(--space-lg);
          z-index: 100;
        }

        /* Main Content */
        .main-content {
          flex: 1;
          padding-top: 60px;
          padding-bottom: 70px;
          width: 100%;
        }

        /* Mobile Bottom Tabs */
        .bottom-tabs {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 62px;
          background: var(--card-bg, #ffffff);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-around;
          align-items: center;
          box-shadow: var(--shadow-lg);
          z-index: 100;
        }

        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: var(--space-xs);
          color: var(--muted);
          text-decoration: none;
          font-size: var(--font-size-sm);
          font-weight: 500;
          transition: color var(--transition-fast);
          flex: 1;
          min-height: 44px;
        }

        .tab-item:hover {
          color: var(--text);
        }

        .tab-item-active {
          color: var(--blue);
        }

        .tab-item:focus-visible {
          outline: 2px solid var(--blue);
          outline-offset: -2px;
        }

        .tab-more { background: none; border: 0; font: inherit; cursor: pointer; color: var(--muted); }
        .tab-more.tab-item-active { color: var(--blue); }
        .more-sheet {
          position: fixed; left: 8px; right: 8px; bottom: 70px; z-index: 101;
          background: var(--card-bg, #ffffff); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: var(--shadow-lg); padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        }
        .more-link { display: block; padding: 14px 12px; border-radius: 12px; color: var(--text); text-decoration: none; font-weight: 500; text-align: center; }
        .more-link:hover, .more-link:focus-visible { background: var(--background); outline: none; }
        .more-link:focus-visible { box-shadow: 0 0 0 2px var(--blue); }
        .more-link-active { color: var(--blue); background: var(--background); }
        @media (min-width: 768px) { .more-sheet { display: none; } }
        .tab-label {
          font-size: 11px;
        }

        /* Desktop Layout */
        @media (min-width: 768px) {
          .sidebar {
            display: flex;
          }

          .mobile-header {
            display: none;
          }

          .main-content {
            margin-left: 240px;
            padding-top: 0;
            padding-bottom: 0;
          }

          .bottom-tabs {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
