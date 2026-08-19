/** In-app how-to for shop staff and accountants. Shown in Settings → How to use. */

export type UserGuideTopic = {
  id: string;
  title: string;
  steps: string[];
};

export const SHOP_GUIDE_INTRO =
  'Use these steps for day-to-day selling and stock. Your tabs may be named Sales or Dispatch depending on the business.';

export const SHOP_GUIDE_TOPICS: UserGuideTopic[] = [
  {
    id: 'shop-start',
    title: 'Typical day',
    steps: [
      'Add or find the customer / vendor in Masters if they are new.',
      'Sell from Sales (scan a barcode) or Record Sale (pick products and qty).',
      'For a GST invoice without barcodes, use Invoices → New.',
      'Print or WhatsApp the bill. Take payment from Finance / Outstanding when money comes in.',
    ],
  },
  {
    id: 'shop-masters',
    title: 'Customers and vendors',
    steps: [
      'Open Masters.',
      'Add a customer (who buys from you) or vendor (who you sell to / buy from).',
      'Save phone, GSTIN, and address so bills fill in automatically.',
    ],
  },
  {
    id: 'shop-stock',
    title: 'Inventory and barcodes',
    steps: [
      'Open Inventory. Add a product (name, price, GST, photo if you use it).',
      'Add stock — the app creates barcodes (one piece, or a box if pack size is set).',
      'Purchases also add stock and barcodes from a supplier bill.',
    ],
  },
  {
    id: 'shop-sale',
    title: 'Record a sale (counter / barcode)',
    steps: [
      'Open Sales and scan or type an InStock barcode — that sells 1 piece.',
      'Or open Record Sale, pick the customer, add products, qty, GST, then save.',
      'Print Tax Invoice / Bill of Supply, or WhatsApp the PDF.',
    ],
  },
  {
    id: 'shop-invoice',
    title: 'Standalone invoice',
    steps: [
      'Open Invoices → New.',
      'Type the party name (pick a match or keep as custom).',
      'Add lines: product or custom item, qty, rate. Unit comes from Bill Customization — not from this screen.',
      'Save as Draft or Create & Send. Print or WhatsApp uses your bill template.',
    ],
  },
  {
    id: 'shop-quote',
    title: 'Quotations',
    steps: [
      'Open Quotations → New. Add lines and price.',
      'Send to the party. When they accept, Convert to an invoice or dispatch.',
    ],
  },
  {
    id: 'shop-dispatch',
    title: 'Dispatch to a vendor',
    steps: [
      'Open Dispatch (or Sales, if that is your tab name).',
      'Choose the vendor, add products and qty, set GST per line, save.',
      'Print challan. Collect later from Finance.',
    ],
  },
  {
    id: 'shop-bills',
    title: 'How bills look (logo, GST, units)',
    steps: [
      'Admin: Settings → Bill Customization.',
      'Set logo, colour, invoice prefix, bank/UPI, terms, and GST on/off.',
      'Sale units: Piece for electrical items; Inch or Cm for plywood; Kg or Meter for measured goods. Tap the unit to use it on every bill line. Save.',
      'Inventory and barcode sales stay piece/box — they do not use Kg/Inch.',
    ],
  },
  {
    id: 'shop-backup',
    title: 'Backup',
    steps: [
      'Admin: Settings → Data Management → download or save a backup.',
      'On phone, keep backups on the device (and email them if you want).',
    ],
  },
];

export const ACCOUNTANT_GUIDE_INTRO =
  'Books is where you post ledgers and vouchers. Accounts is where you print P&L, trial balance, GST, and registers. Open Accounts → Help on that screen for every report.';

export const ACCOUNTANT_GUIDE_TOPICS: UserGuideTopic[] = [
  {
    id: 'acc-books',
    title: 'Start in Books',
    steps: [
      'Open Books (or Accounts, which can embed Books).',
      'First: COA — create ledger groups and ledgers (Cash, Bank, parties, sales, purchase). Or import from Miracle.',
      'Then post vouchers. Reports stay empty until ledgers and vouchers exist.',
    ],
  },
  {
    id: 'acc-receipt',
    title: 'Receipt (money in)',
    steps: [
      'Books → Vouchers → new Receipt (or Cash Book quick entry).',
      'Debit Cash or Bank, credit the party (or income). Add narration and date.',
      'You can link against an invoice / outstanding if the form shows against-ref.',
      'Save. Check Cash Book or the party ledger.',
    ],
  },
  {
    id: 'acc-payment',
    title: 'Payment (money out)',
    steps: [
      'Books → Vouchers → new Payment.',
      'Credit Cash or Bank, debit the supplier / expense.',
      'Save. Check Bank Book or Outstanding.',
    ],
  },
  {
    id: 'acc-sales-purchase',
    title: 'Sales and purchase vouchers',
    steps: [
      'Use Sales / Purchase voucher types in the Vouchers desk when you are booking in Books (not barcode stock).',
      'Day-to-day shop bills still come from Invoices / Record Sale — those feed finance and GST registers.',
    ],
  },
  {
    id: 'acc-reports',
    title: 'Reports an accountant usually needs',
    steps: [
      'Day Book — every entry for the day or range.',
      'Trial Balance — debit total should match credit.',
      'Profit & Loss and Balance Sheet — set From / To (Balance Sheet uses To as “as on”).',
      'Cash Book / Bank Book — running balances; Bank Recon to match the statement.',
      'GST Summary, GSTR-2B / 3B, Sales Register — under Accounts (Compliance). Set dates or month, then Generate.',
    ],
  },
  {
    id: 'acc-outstanding',
    title: 'Who still owes you',
    steps: [
      'Accounts → Outstanding (or Books outstanding).',
      'Open a party or bill and Collect. Payment history is money already received.',
    ],
  },
  {
    id: 'acc-lock',
    title: 'Close books / financial year',
    steps: [
      'Use the financial year control on Accounts when you need Last FY or a quarter.',
      'Books period lock stops vouchers through a chosen date so old months stay closed.',
    ],
  },
  {
    id: 'acc-notes',
    title: 'Credit and debit notes',
    steps: [
      'Accounts → Notes → New Note.',
      'Description, qty, unit (from Bill Settings), price. Link an invoice id if needed.',
    ],
  },
];
