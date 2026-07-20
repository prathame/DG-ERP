/**
 * Legacy Online-only entry. Prefer `electron/desktop` (unified Online/Offline picker).
 */
import { app } from 'electron';
import { bootOnline } from './boot';

app.whenReady().then(() => bootOnline());
