import { isHowToChatQuery, matchChatbotHelp } from '../../shared/chatbotHelp';
import { ensureAiToolsRegistered, getTool } from './index';
import type { ToolContext, ToolResult } from './types';

type TabConfig = Record<string, { label: string; visible: boolean }>;

export type LegacyChatResponse = { text: string; data?: Record<string, unknown> };

function inr(n: unknown): string {
  return Number(n || 0).toLocaleString('en-IN');
}

type PartyMatch = { id: string; name: string; kind: string; phone?: string | null };
type ProductMatch = { name: string; stock?: number; price?: number };

function partyMatches(value: unknown): PartyMatch[] {
  if (!Array.isArray(value)) return [];
  const out: PartyMatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || typeof rec.name !== 'string' || typeof rec.kind !== 'string') continue;
    const phone = rec.phone;
    out.push({
      id: rec.id,
      name: rec.name,
      kind: rec.kind,
      phone: typeof phone === 'string' ? phone : phone === null ? null : undefined,
    });
  }
  return out;
}

function productMatches(value: unknown): ProductMatch[] {
  if (!Array.isArray(value)) return [];
  const out: ProductMatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string') continue;
    out.push({
      name: rec.name,
      stock: typeof rec.stock === 'number' ? rec.stock : undefined,
      price: typeof rec.price === 'number' ? rec.price : undefined,
    });
  }
  return out;
}

async function call(ctx: ToolContext, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) return { error: `Unknown tool ${name}` };
  return tool.handler(ctx, args);
}

export async function answerLegacyChat(args: {
  ctx: ToolContext;
  message: string;
  tabConfig: TabConfig | null;
}): Promise<LegacyChatResponse> {
  ensureAiToolsRegistered();
  const { ctx, message, tabConfig } = args;
  const q = message.trim().toLowerCase();

  if (/^(hi|hello|hey|namaste|hii+|good\s*(morning|afternoon|evening))$/i.test(q)) {
    return {
      text: `Hello! I'm your Dhandho assistant.\n\nI can pull live numbers (sales, stock, invoices) and explain how to use the app.\n\nType *help* for commands, or ask e.g. *"how to set sale units"*.`,
    };
  }

  if (/^(help|commands|menu|options)[?!.]*$|^(what can you do)[?!.]*$/.test(q)) {
    return {
      text: `Here's everything I can do:\n\n*Look up*\n- "sales today"\n- "low stock" / "out of stock"\n- "unpaid invoices"\n- a customer or product name\n- a barcode\n\n*How to*\n- "how to set sale units"\n- "how to create invoice"\n- "how to add stock"\n\nWith AI connected I can also prepare an invoice for you to confirm.`,
    };
  }

  if (/thank|thanks|dhanyawad|shukriya/.test(q)) {
    return { text: `You're welcome! Let me know if you need anything else.` };
  }

  if (
    /sales\s*today|today\s*revenue|today'?s?\s*invoices?|invoices?\s*today|dispatch\s*today|distributed\s*today|^dispatch$/.test(
      q,
    )
  ) {
    const r = await call(ctx, 'get_daily_sales');
    const date = String(r.date || '');
    const inv = r.invoices as { count: number; total: number } | undefined;
    const sales = r.barcodeSales as { count: number; total: number } | undefined;
    const dist = r.dispatch as { count: number; total: number } | undefined;
    if (/dispatch|distributed/.test(q)) {
      return {
        text: `*Dispatch Today* (${date})\n\n- ${dist?.count || 0} unit(s) dispatched\n- Value: ${inr(dist?.total)}`,
      };
    }
    return {
      text: `*Sales Today* (${date})\n\n- Invoices: ${inv?.count || 0} — ₹${inr(inv?.total)}\n- Barcode sales: ${sales?.count || 0} — ₹${inr(sales?.total)}\n- Dispatch: ${dist?.count || 0} — ₹${inr(dist?.total)}`,
    };
  }

  if (/low\s*stock|stock\s*alert|products?\s*running\s*low|running\s*low/.test(q)) {
    const r = await call(ctx, 'get_low_stock');
    const products = (r.products as Array<{ name: string; stock: number }>) || [];
    if (!products.length) return { text: 'No low-stock products (all have 10+ units).' };
    const list = products.map(p => `- ${p.name} — ${p.stock}`).join('\n');
    return { text: `*Low stock*\n\n${list}` };
  }

  if (
    /out\s*of\s*stock|zero\s*stock|no\s*stock|total\s*(inventory|stock)|inventory\s*(count|summary)|stock\s*summary/.test(
      q,
    )
  ) {
    const r = await call(ctx, 'get_inventory_summary');
    return {
      text: `*Inventory*\n\n- Products: ${r.totalProducts || 0}\n- Low stock: ${r.lowStock || 0}\n- Out of stock: ${r.outOfStock || 0}`,
    };
  }

  if (/unpaid\s*invoices?|outstanding\s*invoices?|invoices?\s*(due|unpaid)|due\s*invoices?/.test(q)) {
    const r = await call(ctx, 'get_unpaid_invoices');
    const invoices = (r.invoices as Array<{ invoiceNumber: string; customerName: string; grandTotal: number }>) || [];
    if (!invoices.length) return { text: 'No unpaid invoices. All sent bills are marked paid.' };
    const list = invoices.map(i => `- ${i.invoiceNumber} — ${i.customerName} — ₹${inr(i.grandTotal)}`).join('\n');
    return { text: `*Unpaid invoices*\n\n${list}` };
  }

  const barcodeMatch = q.match(/^[A-Z]{2,}[0-9]+$/i) || q.match(/^[A-Z]+-[A-Z0-9-]+$/i);
  if (barcodeMatch) {
    const r = await call(ctx, 'lookup_barcode', { barcode: barcodeMatch[0] });
    if (r.found) {
      return {
        text: `*Barcode: ${r.barcode}*\n\n- Product: ${r.productName}\n- Status: ${r.status}\n- MRP: ${inr(r.price)}`,
      };
    }
    return { text: `Barcode *${barcodeMatch[0].toUpperCase()}* not found in inventory.` };
  }

  const helpText = matchChatbotHelp(message);
  if (helpText) return { text: helpText };
  if (isHowToChatQuery(message)) {
    return { text: 'Try "help" or "how to create invoice".' };
  }

  const canFuzzy = q.length >= 3 && !/^[%_\\]+$/.test(q);
  if (canFuzzy) {
    const parties = await call(ctx, 'search_customer', { query: message.trim() });
    const matches = partyMatches(parties.matches);
    if (matches.length === 1) {
      const m = matches[0];
      const bal = await call(ctx, 'get_customer_balance', { partyId: m.id, partyType: m.kind });
      if (!bal.error) {
        return {
          text: `*${m.name}*\n\n- Outstanding: ₹${inr(bal.outstanding)}`,
        };
      }
      return { text: `*${m.name}*${m.phone ? `\n- Phone: ${m.phone}` : ''}` };
    }
    if (matches.length > 1) {
      const list = matches.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
      return { text: `Found ${matches.length} matches for "${message}":\n\n${list}\n\nWhich one?` };
    }

    const products = await call(ctx, 'search_product', { query: message.trim() });
    const pmatches = productMatches(products.matches);
    if (pmatches.length === 1) {
      const p = pmatches[0];
      return {
        text: `*${p.name}*\n\n- Price: ${inr(p.price)}\n- In stock: ${p.stock ?? 0}`,
      };
    }
    if (pmatches.length > 1) {
      const list = pmatches.map(p => `- ${p.name}`).join('\n');
      return { text: `Found ${pmatches.length} products matching "${message}":\n\n${list}` };
    }
  }

  void tabConfig;
  return {
    text: `I couldn't find anything for "${message}".\n\nTry:\n- *help* for commands\n- "sales today" / "low stock" / "unpaid invoices"\n- "how to set sale units" / "how to create invoice"\n- A vendor, customer, or product name\n- A barcode (e.g. SUB1H001)`,
  };
}
