/** Live cloud until Render service `dhandho` exists — then flip default (and Cap VITE_API_ORIGIN). */
export const CLOUD_API = process.env.DG_CLOUD_URL || 'https://dg-erp.onrender.com';
export const LOCAL_PG_PORT = 5433;
export const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
