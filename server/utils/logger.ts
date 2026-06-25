import { Logtail } from '@logtail/node';

const LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN;
const logtail = LOGTAIL_TOKEN ? new Logtail(LOGTAIL_TOKEN) : null;

if (logtail) console.log('✓ Logtail connected');

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    console.log(message, context ? JSON.stringify(context) : '');
    logtail?.info(message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(message, context ? JSON.stringify(context) : '');
    logtail?.warn(message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    console.error(message, context ? JSON.stringify(context) : '');
    logtail?.error(message, context);
  },
  flush() {
    return logtail?.flush();
  },
};
