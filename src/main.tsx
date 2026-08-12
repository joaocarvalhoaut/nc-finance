import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import CookieConsent from './components/CookieConsent.tsx';
import { initMonitoring } from './lib/monitoring.ts';
import './index.css';

initMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <CookieConsent />
    </ErrorBoundary>
  </StrictMode>,
);
