import { pool } from './server/pg-db';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const plans = await pool.query('SELECT * FROM plans');
    console.log('Plans in DB:', plans.rows);
    const tenants = await pool.query('SELECT * FROM tenants');
    console.log('Tenants in DB:', tenants.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}
run();
