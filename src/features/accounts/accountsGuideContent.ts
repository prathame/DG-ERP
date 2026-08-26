/** Plain-language Accounts help for end users. Keep roughly aligned with docs/accounts-statements.md */

export type AccountsGuideEntry = {
  key: string;
  label: string;
  group: 'accounts' | 'compliance';
  /** One plain sentence: what you see */
  shows: string;
  /** Short steps: what to click */
  steps: string;
};

export const ACCOUNTS_GUIDE_INTRO = {
  title: 'How to use Accounts',
  steps: [
    'Choose a report from the Statement list.',
    'Set the dates (or month for GST) if you see those boxes.',
    'Click Generate. Some Books reports open by themselves — no Generate needed.',
  ],
  tips: [
    'No data? Try a wider date range, or check that bills/vouchers exist for that period.',
    'Cash Flow always shows money in and out from day-to-day work.',
    'Sales Reg. under Accounts = sales vouchers. Sales Register under Compliance = item-wise sales with GST.',
  ],
};

export const ACCOUNTS_GUIDE_ENTRIES: AccountsGuideEntry[] = [
  {
    key: 'pnl',
    label: 'Profit & Loss',
    group: 'accounts',
    shows: 'Whether the business made profit or loss in the selected period.',
    steps: 'Set From and To dates, then Generate (or wait if Books loads it for you).',
  },
  {
    key: 'dailystatus',
    label: 'Daily Status',
    group: 'accounts',
    shows: 'A quick picture of one day’s accounts work.',
    steps: 'Pick the date. Use the shortcuts to open Day Book, Cash, or Bank.',
  },
  {
    key: 'trading',
    label: 'Trading A/c',
    group: 'accounts',
    shows: 'Gross profit from buying and selling (sales minus purchase/stock).',
    steps: 'Set From and To. Needs Books. This figure feeds into Profit & Loss.',
  },
  {
    key: 'balance',
    label: 'Balance Sheet',
    group: 'accounts',
    shows: 'What the business owns and what it owes on a date.',
    steps: 'With Books: use the To date as “as on”. Without Books: click Generate for a snapshot.',
  },
  {
    key: 'cashflow',
    label: 'Cash Flow',
    group: 'accounts',
    shows: 'Cash that came in and went out in the period.',
    steps: 'Set From and To, then Generate.',
  },
  {
    key: 'ledger',
    label: 'Ledger',
    group: 'accounts',
    shows: 'All entries for one account (party, cash, bank, etc.).',
    steps: 'With Books: tap a ledger name, then set dates. Without Books: pick Type, set dates, Generate.',
  },
  {
    key: 'daybook',
    label: 'Day Book',
    group: 'accounts',
    shows: 'Every account entry for the day or date range.',
    steps: 'With Books: set From–To. Without Books: set From as the day, then Generate.',
  },
  {
    key: 'cashbook',
    label: 'Cash Book',
    group: 'accounts',
    shows: 'Cash in, cash out, and running balance.',
    steps: 'Set From and To. You can also add a quick cash receipt or payment here.',
  },
  {
    key: 'bankbook',
    label: 'Bank Book',
    group: 'accounts',
    shows: 'Bank deposits, withdrawals, and running balance.',
    steps: 'Set From and To. Switch bank account if you have more than one.',
  },
  {
    key: 'bankrecon',
    label: 'Bank Recon',
    group: 'accounts',
    shows: 'Whether your bank book matches the bank statement.',
    steps: 'Pick the as-on date, tick cleared lines, enter the statement balance, save.',
  },
  {
    key: 'pdc',
    label: 'PDC',
    group: 'accounts',
    shows: 'Cheques dated for a future day (not yet cleared).',
    steps: 'Open the list, filter if needed. When the cheque clears, use Realise.',
  },
  {
    key: 'booksales',
    label: 'Sales Reg.',
    group: 'accounts',
    shows: 'List of sales vouchers entered in Books.',
    steps: 'Set From and To. (Different from Compliance → Sales Register.)',
  },
  {
    key: 'bookpurchase',
    label: 'Purchase Reg.',
    group: 'accounts',
    shows: 'List of purchase vouchers entered in Books.',
    steps: 'Set From and To.',
  },
  {
    key: 'vouchers',
    label: 'Vouchers',
    group: 'accounts',
    shows: 'Place to create and open receipts, payments, sales, journals, and more.',
    steps: 'Open Vouchers, then create new or tap an existing one.',
  },
  {
    key: 'trial',
    label: 'Trial Balance',
    group: 'accounts',
    shows: 'All ledger balances — Debit total should match Credit total.',
    steps: 'Set From and To. Needs Books.',
  },
  {
    key: 'products',
    label: 'Book products',
    group: 'accounts',
    shows: 'Stock of items tracked in Books, and each item’s ledger.',
    steps: 'Open the list, then open an item for its stock/ledger.',
  },
  {
    key: 'notes',
    label: 'Credit/Debit Notes',
    group: 'accounts',
    shows: 'Credit notes and debit notes for parties.',
    steps: 'Create a note from this screen, or Generate to refresh the list.',
  },
  {
    key: 'import',
    label: 'Data import',
    group: 'accounts',
    shows: 'Import from Miracle (CMP folder as .rar / .zip).',
    steps: 'Upload the file, wait for the summary, then check Trial Balance and a few ledgers.',
  },
  {
    key: 'sales',
    label: 'Sales Register',
    group: 'compliance',
    shows: 'Item-wise customer sales with GST for the period.',
    steps: 'Set From and To, then Generate.',
  },
  {
    key: 'distribution',
    label: 'Distribution Register',
    group: 'compliance',
    shows: 'Goods sent to dealers / trade sales (name depends on your business type).',
    steps: 'Set From and To, then Generate.',
  },
  {
    key: 'outstanding',
    label: 'Outstanding',
    group: 'compliance',
    shows: 'Who still has to pay you, and how much.',
    steps: 'Open a party or bill and Collect. Or use Collections if you only see the report.',
  },
  {
    key: 'payments',
    label: 'Payment history',
    group: 'compliance',
    shows: 'Money already received in the period.',
    steps: 'Set From and To, then Generate. To take a new payment, use Outstanding or Collections.',
  },
  {
    key: 'stock',
    label: 'Stock Summary',
    group: 'compliance',
    shows: 'How much stock you have and its value.',
    steps: 'Click Generate. (Not shown for some service businesses.)',
  },
  {
    key: 'fineledger',
    label: 'Fine Metal Ledger',
    group: 'compliance',
    shows: 'Fine metal received, issued, and balance on hand.',
    steps: 'Set From and To, then Generate. Only for metal / casting businesses.',
  },
  {
    key: 'gst',
    label: 'GSTR-1',
    group: 'compliance',
    shows: 'GSTR-1 sections for one month: B2B (GSTIN), B2C (no GSTIN), and HSN.',
    steps: 'Pick Month and Year, then Generate. Open B2B / B2C / HSN. Use GSTR-1 JSON for the portal draft file.',
  },
  {
    key: 'gstr2b',
    label: 'GSTR-2B Reconciliation',
    group: 'compliance',
    shows: 'Match GST portal 2B with your purchase records.',
    steps: 'Download 2B JSON from the GST portal, upload it here, then check Matched / Mismatch lists.',
  },
  {
    key: 'gstr3b',
    label: 'GSTR-3B Computation',
    group: 'compliance',
    shows: 'Estimated GSTR-3B numbers (tax to pay / ITC).',
    steps: 'Pick Month and Year, then Generate. Check carefully before you file on the portal.',
  },
];

export function guideEntryForTab(tab: string): AccountsGuideEntry | undefined {
  return ACCOUNTS_GUIDE_ENTRIES.find(e => e.key === tab);
}
