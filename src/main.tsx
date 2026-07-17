import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n';
import { initPlatform } from './platforms';
import { installGlobalErrorHandlers } from './lib/logger';
import './index.css';

installGlobalErrorHandlers();

document.addEventListener(
  'wheel',
  e => {
    const el = document.activeElement;
    if (
      el instanceof HTMLInputElement &&
      (el.type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal')
    ) {
      el.blur();
    }
  },
  { passive: true },
);

void initPlatform().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </StrictMode>,
  );
});
