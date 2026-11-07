import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';
import { Demo } from './Demo';
import { Approve } from './Approve';
import { Ledger } from './Ledger';
import { Mandate } from './Mandate';
import { Author } from './Author';
import { Proof } from './Proof';
import { AttackLab } from './AttackLab';
import { Ops } from './Ops';
import { Verify } from './Verify';
import { ModeChip } from './ui';

function App() {
  const [p, setP] = useState(window.location.pathname);
  useEffect(() => {
    const f = () => setP(window.location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); history.pushState({}, '', to); setP(to); };
  const cur = (to: string) => (p === to || (to === '/demo' && p === '/') ? 'page' : undefined);
  let page;
  if (p.startsWith('/approve/')) page = <Approve actionId={p.split('/')[2] ?? ''} />;
  else if (p === '/ledger') page = <Ledger />;
  else if (p === '/mandate') page = <Mandate />;
  else if (p === '/author') page = <Author />;
  else if (p === '/proof') page = <Proof />;
  else if (p === '/verify') page = <Verify />;
  else if (p === '/attack-lab') page = <AttackLab />;
  else if (p === '/ops') page = <Ops />;
  else page = <Demo />;
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/demo" onClick={go('/demo')}>Rein</a>
        <nav aria-label="Main">
          <a href="/demo" aria-current={cur('/demo')} onClick={go('/demo')}>Demo</a>
          <a href="/ledger" aria-current={cur('/ledger')} onClick={go('/ledger')}>Ledger</a>
          <a href="/ops" aria-current={cur('/ops')} onClick={go('/ops')}>Ops</a>
          <a href="/attack-lab" aria-current={cur('/attack-lab')} onClick={go('/attack-lab')}>Attack Lab</a>
          <a href="/verify" aria-current={cur('/verify')} onClick={go('/verify')}>Verify</a>
          <a href="/author" aria-current={cur('/author')} onClick={go('/author')}>Author</a>
          <a href="/mandate" aria-current={cur('/mandate')} onClick={go('/mandate')}>Mandate</a>
          <a href="/proof" aria-current={cur('/proof')} onClick={go('/proof')}>Proof</a>
        </nav>
        <ModeChip />
      </header>
      <main>{page}</main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
