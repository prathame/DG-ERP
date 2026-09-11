import { describe, expect, it, vi, afterEach } from 'vitest';
import { runAssistantTurn } from '../../server/ai/orchestrate';
import { ensureAiToolsRegistered } from '../../server/ai';
import type { ToolContext } from '../../server/ai/types';

ensureAiToolsRegistered();

const ctx: ToolContext = {
  tenantId: 'T-MOCK',
  userId: 'U-MOCK',
  userName: 'Mock',
  role: 'Admin',
  permissions: undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAssistantTurn function calling', () => {
  it('executes search_customer then returns JSON text without exposing SQL', async () => {
    const search = await import('../../server/ai/registry');
    const tool = search.getTool('search_customer')!;
    vi.spyOn(tool, 'handler').mockResolvedValue({
      untrustedData: true,
      matches: [{ id: 'V1', name: 'Patel Agro', kind: 'vendor' }],
      ambiguous: false,
      found: 1,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'search_customer', args: { query: 'Patel Agro', tenantId: 'evil' } } }],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"text":"Patel Agro mil gaya.","action":null}' }],
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runAssistantTurn({
      ctx,
      apiKey: 'test',
      message: 'Patel Agro ka balance batao',
    });
    expect(out.text).toMatch(/Patel Agro/);
    expect(out.toolsUsed).toContain('search_customer');
    expect(tool.handler).toHaveBeenCalledWith(ctx, expect.not.objectContaining({ tenantId: 'evil' }));
  });

  it('forwards thoughtSignature on the model functionCall turn', async () => {
    const search = await import('../../server/ai/registry');
    const tool = search.getTool('search_customer')!;
    vi.spyOn(tool, 'handler').mockResolvedValue({
      untrustedData: true,
      matches: [{ id: 'V1', name: 'Patel Agro', kind: 'vendor' }],
      found: 1,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    thoughtSignature: 'sig-abc',
                    functionCall: { name: 'search_customer', args: { query: 'Patel Agro' } },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"text":"ok","action":null}' }] } }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await runAssistantTurn({ ctx, apiKey: 'test', message: 'Patel Agro' });
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as {
      contents: Array<{ role: string; parts: Array<{ thoughtSignature?: string }> }>;
    };
    const modelTurn = secondBody.contents.find(c => c.role === 'model');
    expect(modelTurn?.parts.some(p => p.thoughtSignature === 'sig-abc')).toBe(true);
  });
});
