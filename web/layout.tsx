// Responsive layout with sidebar (desktop) and bottom tabs (mobile)
import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';

interface LayoutProps {
  children: any;
  mode: 'SIMULATED' | 'LIVE';
  currentPage: string;
}

const navItems = [
  { id: 'demo', label: 'Demo', path: '/demo' },
  { id: 'shop', label: 'Shop', path: '/shop' },
  { id: 'challenge', label: 'Challenge', path: '/challenge' },
  { id: 'attacklab', label: 'Attack Lab', path: '/attacklab' },
  { id: 'ledger', label: 'Ledger', path: '/ledger' },
  { id: 'ops', label: 'Ops', path: '/ops' },
  { id: 'verify', label: 'Verify', path: '/verify' },
  { id: 'mandate', label: 'Mandate', path: '/mandate' },
];

export function Layout({ children, mode, currentPage }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div class="layout">
      {/* Header */}
      <header class="header">
        <div class="header-content">
          <h1 class="logo">Rein</h1>
          <div class={`chip chip-${mode.toLowerCase()}`}>
            {mode}
          </div>
        </div>
      </header>

      <div class="layout-container">
        {/* Desktop sidebar */}
        <aside class="sidebar desktop-only">
          <nav>
            {navItems.map((item) => (
              <a
                href={item.path}
                class={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main class="main-content">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav class="bottom-tabs mobile-only">
          {navItems.slice(0, 5).map((item) => (
            <a
              href={item.path}
              class={`tab-item ${currentPage === item.id ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <style>{`
        .layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          background: white;
          border-bottom: 1px solid var(--color-border);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1440px;
          margin: 0 auto;
          padding: var(--space-md) var(--space-lg);
        }

        .logo {
          font-size: var(--font-size-xl);
          font-weight: 700;
          color: var(--color-navy);
        }

        .layout-container {
          flex: 1;
          display: flex;
          max-width: 1440px;
          margin: 0 auto;
          width: 100%;
        }

        .sidebar {
          width: 240px;
          background: white;
          border-right: 1px solid var(--color-border);
          padding: var(--space-lg);
        }

        .sidebar nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .nav-item {
          display: block;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          color: var(--color-text);
          text-decoration: none;
          font-weight: 500;
          transition: all var(--transition-fast);
        }

        .nav-item:hover {
          background: var(--color-background);
        }

        .nav-item.active {
          background: var(--color-light-blue);
          color: white;
        }

        .main-content {
          flex: 1;
          padding: var(--space-lg);
          overflow-y: auto;
        }

        .bottom-tabs {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          border-top: 1px solid var(--color-border);
          display: flex;
          justify-content: space-around;
          padding: var(--space-sm);
          box-shadow: var(--shadow-lg);
        }

        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-xs);
          padding: var(--space-xs);
          color: var(--color-muted);
          text-decoration: none;
          font-size: var(--font-size-sm);
          font-weight: 500;
          transition: color var(--transition-fast);
        }

        .tab-item.active {
          color: var(--color-blue);
        }

        .desktop-only {
          display: none;
        }

        .mobile-only {
          display: flex;
        }

        @media (min-width: 768px) {
          .desktop-only {
            display: flex;
          }

          .mobile-only {
            display: none;
          }

          .main-content {
            padding: var(--space-xl);
          }
        }
      `}</style>
    </div>
  );
}
