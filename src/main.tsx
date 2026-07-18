import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n';
import { initPlatform } from './platforms';
import { installGlobalErrorHandlers } from './lib/logger';
import { isServiceMobileMode } from './platforms/service-mobile/mode';
import './index.css';

installGlobalErrorHandlers();

/** Compact phone type/spacing for Offline Mobile and Capacitor shells. */
function applyMobileDenseClass() {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (isServiceMobileMode() || Boolean(cap?.isNativePlatform?.())) {
      document.documentElement.classList.add('dg-mobile-dense');
    }
  } catch {
    /* ignore */
  }
}
applyMobileDenseClass();

document.addEventListener(
  'wheel',
  () => {
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
  const tree = (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
  // PGlite IndexedDB must not be double-mounted (React StrictMode remounts break first boot).
  createRoot(document.getElementById('root')!).render(isServiceMobileMode() ? tree : <StrictMode>{tree}</StrictMode>);
});
