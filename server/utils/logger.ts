import { Logtail } from '@logtail/node';
import { redactContext, redactPii } from './pii';

const LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN;
const logtail = LOGTAIL_TOKEN ? new Logtail(LOGTAIL_TOKEN) : null;

if (logtail) console.log('✓ Logtail connected');

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    const safeMsg = redactPii(message);
    const safeCtx = redactContext(context);
    console.log(safeMsg, safeCtx ? JSON.stringify(safeCtx) : '');
    logtail?.info(safeMsg, safeCtx);
  },
  warn(message: string, context?: Record<string, unknown>) {
    const safeMsg = redactPii(message);
    const safeCtx = redactContext(context);
    console.warn(safeMsg, safeCtx ? JSON.stringify(safeCtx) : '');
    logtail?.warn(safeMsg, safeCtx);
  },
  error(message: string, context?: Record<string, unknown>) {
    const safeMsg = redactPii(message);
    const safeCtx = redactContext(context);
    console.error(safeMsg, safeCtx ? JSON.stringify(safeCtx) : '');
    logtail?.error(safeMsg, safeCtx);
  },
  flush() {
    return logtail?.flush();
  },
};
