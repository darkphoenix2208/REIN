import { h } from 'preact';
import { useState } from 'preact/hooks';

interface LayoutProps {
  children: any;
  mode: 'SIMULATED' | 'LIVE';
}

const NAV_ITEMS = [
  { path: '/', label: 'Demo' },
  { path: '/shop', label: 'Shop' },
  { path: '/attack-lab', label: 'Attack Lab' },
  { path: '/ledger', label: 'Ledger' },
  { path: '/challenge', label: 'Challenge' },
  { path: '/mandate', label: 'Mandate' },
  { path: '/ops', label: 'Ops' },
  { path: '/proof', label: 'Proof' },
  { path: '/verify', label: 'Verify' },
];

export function Layout({ children, mode }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentPath = window.location.pathname;

  return (
    <div class="layout">
      {/* Sidebar (desktop) */}
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Rein</h1>
          <span class={`chip ${mode === 'SIMULATED' ? 'chip-simulated' : 'chip-live'}`}>
            {mode}
          </span>
        </div>
        <nav class="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <a
              key={item.path}
              href={item.path}
              class={`nav-link ${currentPath === item.path ? 'nav-link-active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile header */}
      <header class="mobile-header">
        <h1 class="mobile-title">Rein</h1>
        <span class={`chip ${mode === 'SIMULATED' ? 'chip-simulated' : 'chip-live'}`}>
          {mode}
        </span>
      </header>

      {/* Main content */}
      <main class="main-content">
        {children}
      </main>

      {/* Bottom tabs (mobile) */}
      <nav class="bottom-tabs">
        {NAV_ITEMS.slice(0, 5).map(item => (
          <a
            key={item.path}
            href={item.path}
            class={`tab ${currentPath === item.path ? 'tab-active' : ''}`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <style>{`
        .layout {
          display: grid;
          grid-template-areas:
            "header"
            "main"
            "tabs";
          grid-template-rows: auto 1fr auto;
          min-height: 100vh;
        }

        @media (min-width: 768px) {
          .layout {
            grid-template-areas:
              "sidebar main"
              "sidebar main";
            grid-template-columns: 240px 1fr;
            grid-template-rows: 1fr;
          }
        }

        /* Sidebar (desktop only) */
        .sidebar {
          display: none;
        }

        @media (min-width: 768px) {
          .sidebar {
            display: flex;
            flex-direction: column;
            grid-area: sidebar;
            background: white;
            border-right: 1px solid var(--border);
            padding: var(--space-lg);
            position: sticky;
            top: 0;
            height: 100vh;
            overflow-y: auto;
          }
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-xl);
          padding-bottom: var(--space-lg);
          border-bottom: 1px solid var(--border);
        }

        .sidebar-title {
          font-size: var(--font-size-xl);
          font-weight: 700;
          color: var(--navy);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .nav-link {
          display: block;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          color: var(--text);
          text-decoration: none;
          transition: all var(--transition-fast);
        }

        .nav-link:hover {
          background: var(--background);
          color: var(--blue);
        }

        .nav-link-active {
          background: #E8F4FD;
          color: var(--blue);
          font-weight: 500;
        }

        /* Mobile header */
        .mobile-header {
          grid-area: header;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md);
          background: white;
          border-bottom: 1px solid var(--border);
        }

        @media (min-width: 768px) {
          .mobile-header {
            display: none;
          }
        }

        .mobile-title {
          font-size: var(--font-size-lg);
          font-weight: 700;
          color: var(--navy);
        }

        /* Main content */
        .main-content {
          grid-area: main;
          padding: var(--space-lg);
          overflow-y: auto;
          min-width: 360px;
          max-width: 1440px;
        }

        @media (min-width: 768px) {
          .main-content {
            padding: var(--space-xl);
          }
        }

        /* Bottom tabs (mobile only) */
        .bottom-tabs {
          grid-area: tabs;
          display: flex;
          background: white;
          border-top: 1px solid var(--border);
          padding: var(--space-xs);
        }

        @media (min-width: 768px) {
          .bottom-tabs {
            display: none;
          }
        }

        .tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-sm);
          color: var(--muted);
          text-decoration: none;
          font-size: var(--font-size-sm);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }

        .tab:hover {
          color: var(--blue);
        }

        .tab-active {
          color: var(--blue);
          background: #E8F4FD;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
