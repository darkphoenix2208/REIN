import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '../design-tokens.css';
import './styles.css';
import { Layout } from './Layout';
import { Demo } from './Demo';
import { Approve } from './Approve';
import { Ledger } from './Ledger';
import { Mandate } from './Mandate';
import { Author } from './Author';
import { Proof } from './Proof';
import { AttackLab } from './AttackLab';
import { Ops } from './Ops';
import { Verify } from './Verify';
import { Challenge } from './Challenge';
import { Shop } from './Shop';

function App() {
  const [p, setP] = useState(window.location.pathname);
  const [mode, setMode] = useState<'SIMULATED' | 'LIVE'>('SIMULATED');

  useEffect(() => {
    const f = () => setP(window.location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((j) => setMode(j.mode === 'live' ? 'LIVE' : 'SIMULATED'))
      .catch(() => setMode('SIMULATED'));
  }, []);

  let page;
  if (p.startsWith('/approve/')) page = <Approve actionId={p.split('/')[2] ?? ''} />;
  else if (p === '/ledger') page = <Ledger />;
  else if (p === '/mandate') page = <Mandate />;
  else if (p === '/author') page = <Author />;
  else if (p === '/proof') page = <Proof />;
  else if (p === '/verify') page = <Verify />;
  else if (p === '/challenge') page = <Challenge />;
  else if (p === '/shop') page = <Shop />;
  else if (p === '/attack-lab') page = <AttackLab />;
  else if (p === '/ops') page = <Ops />;
  else page = <Demo />;

  return (
    <Layout mode={mode} currentPath={p}>
      {page}
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
