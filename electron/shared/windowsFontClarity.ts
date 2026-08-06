/**
 * Windows Electron: Chromium + fractional DPI + backdrop-filter often makes UI
 * text look soft / uneven (thin stems like “I” look oddly bold). Apply before
 * app.whenReady() / BrowserWindow creation.
 */
import { app } from 'electron';

export function applyWindowsElectronFontClarity(): void {
  if (process.platform !== 'win32') return;
  // Prefer crisp LCD glyph rendering over GPU-smoothed text on fractional scales.
  app.commandLine.appendSwitch('enable-font-antialiasing');
  app.commandLine.appendSwitch('font-render-hinting', 'medium');
  // Keep High-DPI awareness so 125%/150% Windows scaling stays sharp.
  app.commandLine.appendSwitch('high-dpi-support', '1');
}
