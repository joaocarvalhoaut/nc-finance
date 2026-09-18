import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import CookieConsent from './components/CookieConsent.tsx';
import { initMonitoring } from './lib/monitoring.ts';
import { bootstrapAnalytics } from './lib/analytics.ts';
import './index.css';

initMonitoring();
bootstrapAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div role="status" className="min-h-screen bg-zinc-950 text-white p-8">Carregando NC Finance…</div>}>
        <App />
      </Suspense>
      <CookieConsent />
    </ErrorBoundary>
  </StrictMode>,
);
