import { Logtail } from '@logtail/node';
const LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN;
const logtail = LOGTAIL_TOKEN ? new Logtail(LOGTAIL_TOKEN) : null;
if (logtail)
    console.log('✓ Logtail connected');
export const logger = {
    info(message, context) {
        console.log(message, context ? JSON.stringify(context) : '');
        logtail?.info(message, context);
    },
    warn(message, context) {
        console.warn(message, context ? JSON.stringify(context) : '');
        logtail?.warn(message, context);
    },
    error(message, context) {
        console.error(message, context ? JSON.stringify(context) : '');
        logtail?.error(message, context);
    },
    flush() {
        return logtail?.flush();
    },
};
