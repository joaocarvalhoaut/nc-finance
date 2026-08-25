import {StrictMode} from 'react';
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
      <App />
      <CookieConsent />
    </ErrorBoundary>
  </StrictMode>,
);
