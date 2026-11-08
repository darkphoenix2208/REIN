import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  mode?: 'SIMULATED' | 'LIVE';
  currentPath: string;
}

const navItems = [
  { id: 'demo', label: 'Demo', path: '/' },
  { id: 'shop', label: 'Shop', path: '/shop' },
  { id: 'challenge', label: 'Challenge', path: '/challenge' },
  { id: 'attack-lab', label: 'Attack Lab', path: '/attack-lab' },
  { id: 'ledger', label: 'Ledger', path: '/ledger' },
  { id: 'ops', label: 'Ops', path: '/ops' },
  { id: 'verify', label: 'Verify', path: '/verify' },
  { id: 'mandate', label: 'Mandate', path: '/mandate' },
  { id: 'author', label: 'Author', path: '/author' },
  { id: 'proof', label: 'Proof', path: '/proof' },
];

export function Layout({ children, mode = 'SIMULATED', currentPath }: LayoutProps) {
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
          <h1 className="logo">Rein</h1>
          <span className={`chip chip-${mode.toLowerCase()}`}>{mode}</span>
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
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile header */}
      <header className="mobile-header">
        <h1 className="logo">Rein</h1>
        <span className={`chip chip-${mode.toLowerCase()}`}>{mode}</span>
      </header>

      {/* Main content */}
      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs - 5 primary pages */}
      <nav className="bottom-tabs" aria-label="Primary navigation">
        {navItems.slice(0, 5).map((item) => (
          <a
            key={item.id}
            href={item.path}
            onClick={go(item.path)}
            className={`tab-item ${currentPath === item.path ? 'tab-item-active' : ''}`}
            aria-current={currentPath === item.path ? 'page' : undefined}
          >
            <span className="tab-label">{item.label}</span>
          </a>
        ))}
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
          background: white;
          border-right: 1px solid var(--border);
          display: none;
          flex-direction: column;
          z-index: 100;
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
          font-weight: 600;
          color: var(--navy);
          margin: 0;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
          padding: var(--space-md);
          overflow-y: auto;
        }

        .nav-link {
          display: block;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          color: var(--text);
          text-decoration: none;
          font-weight: 500;
          font-size: var(--font-size-base);
          transition: all var(--transition-fast);
          min-height: 44px;
          display: flex;
          align-items: center;
        }

        .nav-link:hover {
          background: var(--background);
        }

        .nav-link-active {
          background: var(--blue);
          color: white;
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
          background: white;
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
          height: 60px;
          background: white;
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
          gap: var(--space-xs);
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

        .tab-label {
          font-size: var(--font-size-sm);
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

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .nav-link,
          .tab-item {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
