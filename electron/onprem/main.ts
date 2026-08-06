/**
 * Legacy Offline-only entry. Prefer `electron/desktop` (unified Online/Offline picker).
 */
import { app } from 'electron';
import { bootOffline } from './boot';
import { applyWindowsElectronFontClarity } from '../shared/windowsFontClarity';

applyWindowsElectronFontClarity();
app.whenReady().then(() => bootOffline());
