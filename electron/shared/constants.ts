export const CLOUD_API = process.env.DG_CLOUD_URL || 'https://dg-erp.onrender.com';
export const LOCAL_PG_PORT = 5433;
export const LOCAL_API_PORT = 3001;
export const LOCAL_API_URL = `http://localhost:${LOCAL_API_PORT}`;
export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
