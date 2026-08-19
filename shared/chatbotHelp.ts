/** In-app support answers for the chatbot (how-to). Matched by keywords — no LLM. */

export type ChatHelpArticle = {
  id: string;
  title: string;
  keywords: string[];
  body: string;
};

export const CHATBOT_HELP_ARTICLES: ChatHelpArticle[] = [
  {
    id: 'sale-units',
    title: 'Sale units (Kg, Meter, Piece)',
    keywords: [
      'sale unit',
      'bill unit',
      'sale units',
      'uom',
      'quantity unit',
      'how to sell in kg',
      'sell in kg',
      'sell in meter',
    ],
    body: `*Sale Units*\n\nSet them only in *Settings → Bill Customization → Sale Units* — not on the invoice.\nElectrical shops use Piece. Plywood can use Inch or Cm. Measured goods use Kg or Meter.\nTap a unit so it is first — every new bill line uses that unit. Qty can be decimal (e.g. 2.5 Kg).\n\n*Inventory, barcode Sales, Purchases, and Dispatch stay piece/box* — those track barcodes, not Kg stock.`,
  },
  {
    id: 'bill-settings',
    title: 'Bill customization',
    keywords: [
      'bill customization',
      'bill settings',
      'invoice logo',
      'invoice prefix',
      'bank details on bill',
      'terms and conditions',
      'brand color',
    ],
    body: `*Bill Customization*\n\nGo to *Settings → Bill Customization*.\n\nSet logo, brand color, invoice prefix, bank/UPI, terms, signatory, GST on/off, and sale units.\nSave once — new invoices and quotations use this template when you print or share on WhatsApp.`,
  },
  {
    id: 'gst-bills',
    title: 'GST on invoices',
    keywords: ['gst', 'gst on invoice', 'enable gst', 'hsn', 'tax invoice', 'gst toggle'],
    body: `*GST on bills*\n\n*Settings → Bill Customization → GST*.\nWhen ON, new invoices/quotations show tax %, HSN/SAC, and Tax Invoice layout.\nWhen OFF, bills stay simple (no tax columns).\nChanging GST later does *not* rewrite old bills — each document keeps the mode it was created with.`,
  },
  {
    id: 'invoices',
    title: 'Create an invoice',
    keywords: ['create invoice', 'new invoice', 'make a bill', 'how to invoice', 'standalone invoice'],
    body: `*Create an invoice*\n\nOpen *Invoices* → New.\nAdd party name, then lines (catalog item or custom description).\nQty uses your sale unit from Bill Settings. Set Rate, then Save as draft or send.\nPrint or WhatsApp uses your Bill Customization template.\n\nAsk me *"unpaid invoices"* or *"invoices today"* for live totals.`,
  },
  {
    id: 'quotations',
    title: 'Quotations',
    keywords: ['quotation', 'quote', 'convert quote', 'how to quote'],
    body: `*Quotations*\n\nOpen *Quotations* → New. Add lines with qty and price. Unit comes from Bill Settings.\nStatuses: Draft → Sent → Accepted, then *Convert* to an invoice (service) or dispatch (goods).\nPartial convert is allowed until remaining qty is 0.\n\nAsk me *"quotations"* for a live count.`,
  },
  {
    id: 'inventory',
    title: 'Manage inventory',
    keywords: ['add stock', 'add product', 'barcode', 'inventory', 'how to add stock', 'metal stock'],
    body: `*Inventory*\n\nOpen *Inventory* (or Metal Stock). Add a product, then add stock — barcodes are generated (prefix / auto / range).\nEach barcode is one piece (or a box if pack size is set).\nLow stock in this chat means fewer than 10 *InStock* barcodes.\n\nAsk me *"low stock"*, *"out of stock"*, *"total inventory"*, or type a barcode.`,
  },
  {
    id: 'sales',
    title: 'Record a sale',
    keywords: ['how to sell', 'counter sale', 'barcode sale', 'sales entry'],
    body: `*Sales (barcode)*\n\nOpen *Sales* → scan or enter a barcode that is InStock (or Distributed to you).\nThat records 1 piece sold, and can create warranty/rewards when those modules are on.\n\nFor Kg/Meter billing without barcodes, set the unit in *Settings → Bill Customization*, then use *Invoices*.\n\nAsk me *"sales today"* or *"recent sales"*.`,
  },
  {
    id: 'dispatch',
    title: 'Dispatch / distribution',
    keywords: ['dispatch', 'distribution', 'challan', 'how to dispatch'],
    body: `*Dispatch*\n\nOpen *Dispatch* (or Sales, depending on your tabs) → create a batch for a vendor, pick products and qty (barcode units), then save.\nYou can apply GST, print challan, and record vendor payments in Finance.\n\nAsk me *"dispatch today"* or *"dispatch summary"*.`,
  },
  {
    id: 'purchases',
    title: 'Purchases',
    keywords: ['purchase', 'buy stock', 'supplier invoice'],
    body: `*Purchases*\n\nOpen *Purchases* → record supplier, product, qty (pieces or packs), and cost.\nStock barcodes are created so items can be sold or dispatched.\nThis is piece/box stock, not Kg from Bill Settings.`,
  },
  {
    id: 'notes',
    title: 'Credit and debit notes',
    keywords: ['credit note', 'debit note', 'cn', 'dn'],
    body: `*Credit / Debit notes*\n\nAccounts → Notes → New Note.\nAdd description, qty, *unit* (from Bill Settings), and price.\nLink an invoice/dispatch/quotation id if needed.`,
  },
  {
    id: 'chatbot',
    title: 'This assistant',
    keywords: ['chatbot', 'this chat', 'what can you do', 'erp assistant'],
    body: `I answer *live business data* (sales, stock, invoices, vendors) and *how-to* for Dhandho screens.\n\nType *help* for commands. Try: "sales today", "low stock", "unpaid invoices", "how to set sale units".`,
  },
];

function normalizeHelpQuery(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHowToChatQuery(q: string): boolean {
  return /^(how\s+(do\s+i|to|can\s+i)|where\s+(is|do|can)|what\s+is|explain|guide|help\s+with|how\s+do\s+we)/.test(q);
}

/** Returns a formatted help reply, or null if the message is not a how-to/support question. */
export function matchChatbotHelp(input: string): string | null {
  const q = normalizeHelpQuery(input);
  if (!q || q === 'help' || q === 'commands' || q === 'menu') return null;

  const howTo = isHowToChatQuery(q);
  let best: ChatHelpArticle | null = null;
  let bestScore = 0;

  for (const article of CHATBOT_HELP_ARTICLES) {
    let score = 0;
    for (const kw of article.keywords) {
      if (q.includes(kw)) score += Math.max(1, kw.split(' ').length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = article;
    }
  }

  const threshold = howTo ? 1 : 3;
  if (!best || bestScore < threshold) return null;
  return `${best.body}\n\nType *help* for data commands.`;
}
