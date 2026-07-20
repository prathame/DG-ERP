/**
 * Legacy Offline-only entry. Prefer `electron/desktop` (unified Online/Offline picker).
 */
import { app } from 'electron';
import { bootOffline } from './boot';

app.whenReady().then(() => bootOffline());
