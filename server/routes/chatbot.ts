import { Router } from 'express';
import { pool } from '../pg-db';
import { logger } from '../utils/logger';
import { handleApiError } from '../utils/http-error';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { ensureAiToolsRegistered, runAssistantTurn, GeminiCallError } from '../ai';
import { confirmPendingInvoice, cancelPendingInvoice } from '../ai/pending';
import type { ToolContext } from '../ai/types';
import type { AccessLevel } from '../middleware/permissions';

const router = Router();

interface ChatResponse {
  text: string;
  data?: Record<string, unknown>;
}

type TabConfig = Record<string, { label: string; visible: boolean }>;

function tabLabel(config: TabConfig | null, key: string, fallback: string): string {
  return config?.[key]?.label || fallback;
}

function toolContextFromReq(req: AuthRequest, tenantId: string): ToolContext {
  return {
    tenantId,
    userId: req.user?.userId || '',
    userName: req.user?.name || '',
    role: req.user?.role || 'Staff',
    permissions: req.user?.permissions as Record<string, AccessLevel> | undefined,
    correlationId: (req as { correlationId?: string }).correlationId,
  };
}

async function query(
  input: string,
  tenantId: string,
  tabConfig: TabConfig | null = null,
  ctx?: ToolContext,
): Promise<ChatResponse> {
  ensureAiToolsRegistered();
  const { answerLegacyChat } = await import('../ai/fallback');
  return answerLegacyChat({
    ctx: ctx || {
      tenantId,
      userId: '',
      userName: '',
      role: 'Admin',
      permissions: undefined,
    },
    message: input,
    tabConfig,
  });
}

router.get('/api/chatbot/quick-actions', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const tenantRow = (await pool.query('SELECT tab_config, chatbot_enabled FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as { tab_config: TabConfig | null; chatbot_enabled?: boolean } | undefined;
    if (!tenantRow) return res.status(401).json({ error: 'Tenant not found' });
    if (tenantRow.chatbot_enabled === false)
      return res.status(403).json({ error: 'Chatbot is disabled for this company' });
    const tc = tenantRow.tab_config ?? null;
    const actions: string[] = ['help', 'daily report'];
    if (tc?.sales?.visible !== false || tc?.distribution?.visible !== false) {
      const label =
        tc?.sales?.visible === false && tc?.distribution?.label ? tc.distribution.label.toLowerCase() : 'sales';
      actions.push(`${label} today`);
    }
    actions.push('low stock');
    if (tc?.invoices?.visible !== false) actions.push('unpaid invoices');
    actions.push('pending payments');
    if (tc?.distribution?.visible !== false)
      actions.push(`${tabLabel(tc, 'distribution', 'distribution').toLowerCase()} summary`);
    actions.push('all vendors');
    res.json({ actions });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Dhandho AI Assistant — Gemini-powered, falls back to typed tools ────────
router.post('/api/ai/assistant', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { message, history } = req.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; text: string }[];
    };
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
    const trimmed = message.trim();
    if (!trimmed) return res.status(400).json({ error: 'message required' });
    if (trimmed.length > 2000) return res.status(400).json({ error: 'message too long' });

    const keyRow = await pool.query('SELECT gemini_api_key FROM bill_settings WHERE tenant_id = $1', [tenantId]);
    const apiKey = (keyRow.rows[0]?.gemini_api_key as string) || process.env.GEMINI_API_KEY;

    const fallbackChat = async () => {
      const tenantRow = (await pool.query('SELECT tab_config FROM tenants WHERE id = $1', [tenantId])).rows[0] as
        { tab_config: TabConfig | null } | undefined;
      return query(trimmed, tenantId, tenantRow?.tab_config ?? null, toolContextFromReq(req, tenantId));
    };

    if (!apiKey) {
      return res.json(await fallbackChat());
    }

    ensureAiToolsRegistered();
    const ctx = toolContextFromReq(req, tenantId);
    logger.info('AI assistant request', {
      tenantId,
      userId: ctx.userId,
      correlationId: ctx.correlationId,
    });
    try {
      const result = await runAssistantTurn({
        ctx,
        apiKey,
        message: trimmed,
        history,
        userName: req.user?.name,
      });
      return res.json(result);
    } catch (err) {
      if (err instanceof GeminiCallError || (err instanceof Error && err.name === 'AbortError')) {
        logger.warn('Gemini failed, falling back to regex chatbot', {
          tenantId,
          status: err instanceof GeminiCallError ? err.status : 'timeout',
        });
        return res.json(await fallbackChat());
      }
      throw err;
    }
  } catch (err) {
    logger.exception('AI assistant request failed', err, {
      method: req.method,
      path: req.path,
      correlationId: (req as { correlationId?: string }).correlationId,
      tenantId: (req as AuthRequest).tenantId,
      userId: (req as AuthRequest).user?.userId,
    });
    res.status(500).json({ text: 'Something went wrong. Please try again.' });
  }
});

router.post('/api/ai/actions/:actionId/confirm', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    ensureAiToolsRegistered();
    const result = await confirmPendingInvoice(toolContextFromReq(req, tenantId), String(req.params.actionId || ''));
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    res.json({
      text: `Invoice ${String(result.invoice.invoiceNumber)} create ho gaya. Total ₹${Number(result.invoice.grandTotal).toLocaleString('en-IN')}.`,
      invoice: result.invoice,
      created: result.created,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/ai/actions/:actionId/cancel', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await cancelPendingInvoice(toolContextFromReq(req, tenantId), String(req.params.actionId || ''));
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    res.json({ text: 'Cancelled. Invoice create nahi hua.', cancelled: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/chatbot', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
    const trimmed = message.trim();
    if (!trimmed) return res.status(400).json({ error: 'message required' });
    if (trimmed.length > 2000) return res.status(400).json({ error: 'message too long' });
    const tenantRow = (await pool.query('SELECT tab_config, chatbot_enabled FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as { tab_config: TabConfig | null; chatbot_enabled?: boolean } | undefined;
    if (!tenantRow) return res.status(401).json({ error: 'Tenant not found' });
    if (tenantRow.chatbot_enabled === false)
      return res.status(403).json({ error: 'Chatbot is disabled for this company' });
    const tabConfig = tenantRow.tab_config ?? null;
    const response = await query(trimmed, tenantId, tabConfig, toolContextFromReq(req, tenantId));
    res.json(response);
  } catch (err) {
    logger.exception('Chatbot request failed', err, {
      method: req.method,
      path: req.path,
      correlationId: (req as { correlationId?: string }).correlationId,
      tenantId: (req as AuthRequest).tenantId,
      userId: (req as AuthRequest).user?.userId,
    });
    res.status(500).json({ text: 'Something went wrong. Please try again.' });
  }
});

export default router;
