import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/audit-log', (req, res) => {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    where += applyDateFilter(req.query as Record<string, unknown>, 'created_at', params);
    const { entityType } = req.query;
    if (typeof entityType === 'string' && entityType) { where += ' AND entity_type = ?'; params.push(entityType); }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params) as { c: number }).c;
    const countParams = [...params];
    params.push(limit, offset);
    const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params) as Record<string, unknown>[];
    res.json({
      data: rows.map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: r.details, createdAt: r.created_at })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/backup', (_req, res) => {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'splendor.db');
    if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Database file not found' });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Disposition', `attachment; filename=splendor-backup-${date}.db`);
    res.setHeader('Content-Type', 'application/octet-stream');
    const stream = fs.createReadStream(dbPath);
    stream.pipe(res);
    logAudit('Database Backup', 'system', undefined, 'Full database backup downloaded');
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
