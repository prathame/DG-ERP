import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

interface ChatResponse {
  text: string;
  data?: Record<string, unknown>;
}

type TabConfig = Record<string, { label: string; visible: boolean }>;

function tabLabel(config: TabConfig | null, key: string, fallback: string): string {
  return config?.[key]?.label || fallback;
}

function resolveFeature(config: TabConfig | null, term: string): string | null {
  if (!config) return null;
  const lower = term.toLowerCase();
  for (const [key, val] of Object.entries(config)) {
    if (val.visible && val.label.toLowerCase().includes(lower)) return key;
  }
  return null;
}

async function query(input: string, tenantId: string, tabConfig: TabConfig | null = null): Promise<ChatResponse> {
  const q = input.trim().toLowerCase();

  // ============ GREETINGS ============
  if (/^(hi|hello|hey|namaste|hii+|good\s*(morning|afternoon|evening))$/i.test(q)) {
    return { text: `Hello! I'm your ERP assistant.\n\nType *help* to see all commands, or just ask me anything about your business!` };
  }

  // ============ HELP ============
  if (/^(help|commands|menu|what can you do|options)/.test(q)) {
    const salesLabel = tabLabel(tabConfig, 'sales', 'Sales');
    const distLabel = tabLabel(tabConfig, 'distribution', 'Distribution');
    const invLabel = tabLabel(tabConfig, 'inventory', 'Inventory');
    const warLabel = tabLabel(tabConfig, 'warranty', 'Warranty');
    const finLabel = tabLabel(tabConfig, 'finance', 'Finance');
    const sections: string[] = [];
    sections.push(`*${invLabel}*\n- "low stock" -- products under 10 units\n- "out of stock" -- products with 0 units\n- "total inventory" -- full stock breakdown\n- "all products" -- list all products\n- Any barcode -- status & details`);
    if (tabConfig?.distribution?.visible !== false) sections.push(`*${distLabel}*\n- "dispatch today" -- today's dispatch\n- "dispatch summary" -- distribution overview`);
    if (tabConfig?.sales?.visible !== false) sections.push(`*${salesLabel}*\n- "sales today" -- today's count & revenue\n- "sales this month" -- monthly summary\n- "recent sales" -- last 5 sales`);
    sections.push(`*Vendors*\n- Any vendor name -- full details + finance\n- "all vendors" -- list all\n- "pending payments" -- who owes money`);
    sections.push(`*Customers*\n- Any customer name -- purchase history\n- "all customers" -- list all`);
    if (tabConfig?.finance?.visible !== false) sections.push(`*${finLabel}*\n- "total revenue" -- all-time revenue\n- "today revenue" -- today's revenue`);
    if (tabConfig?.warranty?.visible !== false) sections.push(`*${warLabel}*\n- "active warranties" -- count\n- "expiring warranties" -- expiring in 30 days`);
    sections.push(`*Reports*\n- "daily report" -- today's summary\n- "monthly report" -- this month's summary\n- "vendor report" -- all vendors overview`);
    return { text: `Here's everything I can do:\n\n${sections.join('\n\n')}` };
  }

  // ============ SMART SALES ROUTING ============
  // If user types "sales" but their sales tab is OFF and distribution is labeled "Sales", route to distribution data
  const salesTabVisible = tabConfig?.sales?.visible !== false;
  const distLabeledAsSales = tabConfig?.distribution?.label?.toLowerCase().includes('sales') ?? false;
  const salesMeansDistribution = !salesTabVisible && distLabeledAsSales;
  const salesLbl = salesMeansDistribution ? tabLabel(tabConfig, 'distribution', 'Sales') : tabLabel(tabConfig, 'sales', 'Sales');
  const distLbl = tabLabel(tabConfig, 'distribution', 'Distribution');

  if (/sales\s*today/.test(q)) {
    if (salesMeansDistribution) {
      const today = new Date().toISOString().slice(0, 10);
      const count = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE distribution_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { c: number }).c;
      const value = ((await pool.query("SELECT COALESCE(SUM(COALESCE(billed_price, net_price, 0)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.distribution_date = $2 AND pd.tenant_id = $1", [tenantId, today])).rows[0] as { t: number }).t;
      return { text: `*${salesLbl} Today* (${today})\n\n- ${count} unit${count !== 1 ? 's' : ''} dispatched\n- Value: ${value.toLocaleString()}` };
    }
    const today = new Date().toISOString().slice(0, 10);
    const count = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { t: number }).t;
    return { text: `*${salesLbl} Today* (${today})\n\n- ${count} sale${count !== 1 ? 's' : ''}\n- Revenue: ${revenue.toLocaleString()}` };
  }

  if (/sales\s*yesterday/.test(q)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const count = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [yesterday, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [yesterday, tenantId])).rows[0] as { t: number }).t;
    return { text: `*${salesLbl} Yesterday* (${yesterday})\n\n- ${count} sale${count !== 1 ? 's' : ''}\n- Revenue: ${revenue.toLocaleString()}` };
  }

  if (/sales\s*(this\s*)?week/.test(q)) {
    const d = new Date(); d.setDate(d.getDate() - 7);
    const weekAgo = d.toISOString().slice(0, 10);
    const count = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date >= $1 AND tenant_id = $2", [weekAgo, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date >= $1 AND tenant_id = $2", [weekAgo, tenantId])).rows[0] as { t: number }).t;
    return { text: `*${salesLbl} This Week*\n\n- ${count} sale${count !== 1 ? 's' : ''}\n- Revenue: ${revenue.toLocaleString()}` };
  }

  if (/sales\s*(this\s*)?month/.test(q)) {
    const month = new Date().toISOString().slice(0, 7);
    const count = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { t: number }).t;
    return { text: `*${salesLbl} This Month*\n\n- ${count} sale${count !== 1 ? 's' : ''}\n- Revenue: ${revenue.toLocaleString()}` };
  }

  if (/recent\s*sales|last\s*sales|latest\s*sales/.test(q)) {
    const rows = (await pool.query("SELECT ps.barcode, p.name, ps.customer_name, ps.purchase_date, ps.sale_price FROM product_sales ps JOIN products p ON ps.product_id = p.id WHERE ps.tenant_id = $1 ORDER BY ps.purchase_date DESC LIMIT 5", [tenantId])).rows as { barcode: string; name: string; customer_name: string; purchase_date: string; sale_price: number }[];
    if (rows.length === 0) return { text: 'No sales recorded yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.name} -> ${r.customer_name}\n   ${r.purchase_date} - ${(r.sale_price ?? 0).toLocaleString()}`).join('\n');
    return { text: `*Recent ${salesLbl}*\n\n${list}` };
  }

  // ============ TOP PRODUCTS ============
  if (/top\s*product|best\s*sell|popular\s*product/.test(q)) {
    const rows = (await pool.query("SELECT p.name, COUNT(ps.id) as sold, COALESCE(SUM(ps.sale_price), 0) as revenue FROM product_sales ps JOIN products p ON ps.product_id = p.id WHERE ps.tenant_id = $1 GROUP BY ps.product_id, p.name ORDER BY sold DESC LIMIT 5", [tenantId])).rows as { name: string; sold: number; revenue: number }[];
    if (rows.length === 0) return { text: 'No sales recorded yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.name}\n   ${r.sold} sold - ${r.revenue.toLocaleString()} revenue`).join('\n');
    return { text: `*Top Selling Products*\n\n${list}` };
  }

  // ============ INVENTORY ============
  if (/low\s*stock|stock\s*alert/.test(q)) {
    const rows = (await pool.query("SELECT p.name, COUNT(pi.id) as stock FROM products p LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1 WHERE p.tenant_id = $1 GROUP BY p.id, p.name HAVING COUNT(pi.id) < 10 AND COUNT(pi.id) > 0 ORDER BY COUNT(pi.id) ASC LIMIT 10", [tenantId])).rows as { name: string; stock: number }[];
    if (rows.length === 0) return { text: 'All products have sufficient stock!' };
    const list = rows.map((r) => `- ${r.name} -- ${r.stock} left`).join('\n');
    return { text: `*Low Stock Alert*\n\n${list}` };
  }

  if (/out\s*of\s*stock|zero\s*stock|no\s*stock/.test(q)) {
    const rows = (await pool.query("SELECT p.name FROM products p LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1 WHERE p.tenant_id = $1 GROUP BY p.id, p.name HAVING COUNT(pi.id) = 0", [tenantId])).rows as { name: string }[];
    if (rows.length === 0) return { text: 'No products are out of stock!' };
    const list = rows.map((r) => `- ${r.name}`).join('\n');
    return { text: `*Out of Stock*\n\n${list}` };
  }

  if (/total\s*(inventory|stock)|inventory\s*(count|summary)|how\s*many\s*product|stock\s*summary/.test(q)) {
    const total = ((await pool.query("SELECT COUNT(*) as c FROM product_inventory WHERE tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const inStock = ((await pool.query("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'InStock' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const distributed = ((await pool.query("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'Distributed' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const soldInv = ((await pool.query("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'Sold' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const productCount = ((await pool.query("SELECT COUNT(*) as c FROM products WHERE tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    return { text: `*Inventory Summary*\n\n- Product types: ${productCount}\n- Total units: ${total}\n- With Admin: ${inStock}\n- With Vendors: ${distributed}\n- Sold: ${soldInv}` };
  }

  if (/all\s*product|list\s*product|show\s*product|product\s*list/.test(q)) {
    const rows = (await pool.query("SELECT p.name, p.price, COUNT(pi.id) as stock FROM products p LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1 WHERE p.tenant_id = $1 GROUP BY p.id, p.name, p.price ORDER BY p.name", [tenantId])).rows as { name: string; price: number; stock: number }[];
    if (rows.length === 0) return { text: 'No products found.' };
    const list = rows.map((r) => `- ${r.name}\n  ${r.price.toLocaleString()} - ${r.stock} in stock`).join('\n');
    return { text: `*All Products (${rows.length})*\n\n${list}` };
  }

  // ============ VENDORS ============
  if (/all\s*vendor|list\s*vendor|show\s*vendor|vendor\s*list/.test(q)) {
    const rows = (await pool.query("SELECT name, phone FROM vendors WHERE id != 'OWNER' AND tenant_id = $1 ORDER BY name", [tenantId])).rows as { name: string; phone: string }[];
    if (rows.length === 0) return { text: 'No vendors found.' };
    const list = rows.map((r) => `- ${r.name}${r.phone ? ` (${r.phone})` : ''}`).join('\n');
    return { text: `*All Vendors (${rows.length})*\n\n${list}` };
  }

  if (/top\s*vendor|best\s*vendor/.test(q)) {
    const rows = (await pool.query("SELECT v.name, v.total_sales as sold, v.total_reward_points as pts FROM vendors v WHERE v.id != 'OWNER' AND v.total_sales > 0 AND v.tenant_id = $1 ORDER BY v.total_sales DESC LIMIT 5", [tenantId])).rows as { name: string; sold: number; pts: number }[];
    if (rows.length === 0) return { text: 'No vendor sales recorded yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.name}\n   ${r.sold} sold - ${r.pts} reward pts`).join('\n');
    return { text: `*Top Vendors*\n\n${list}` };
  }

  // ============ PENDING PAYMENTS ============
  if (/pending\s*payment|who\s*owe|outstanding|due\s*payment|vendor\s*balance/.test(q)) {
    const rows = (await pool.query(`
      SELECT v.name,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_val,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as paid
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1
      GROUP BY v.id, v.name
      HAVING COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) -
             COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) > 0
      ORDER BY (COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) -
                COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0)) DESC
    `, [tenantId])).rows as { name: string; total_val: number; paid: number }[];
    if (rows.length === 0) return { text: 'All vendors are settled! No pending payments.' };
    const list = rows.map((r) => `- ${r.name}\n  Billed: ${r.total_val.toLocaleString()} | Paid: ${r.paid.toLocaleString()} | *Due: ${(r.total_val - r.paid).toLocaleString()}*`).join('\n');
    const totalDue = rows.reduce((s, r) => s + (r.total_val - r.paid), 0);
    return { text: `*Pending Payments* (${rows.length} vendors)\n\n${list}\n\nTotal Outstanding: *${totalDue.toLocaleString()}*` };
  }

  // ============ CUSTOMERS ============
  if (/all\s*customer|list\s*customer|show\s*customer|customer\s*list/.test(q)) {
    const rows = (await pool.query("SELECT name, phone FROM customers WHERE tenant_id = $1 ORDER BY name LIMIT 20", [tenantId])).rows as { name: string; phone: string }[];
    if (rows.length === 0) return { text: 'No customers found.' };
    const total = ((await pool.query("SELECT COUNT(*) as c FROM customers WHERE tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const list = rows.map((r) => `- ${r.name}${r.phone ? ` (${r.phone})` : ''}`).join('\n');
    return { text: `*Customers (${total} total)*\n\n${list}${total > 20 ? `\n\n... and ${total - 20} more` : ''}` };
  }

  if (/top\s*customer|best\s*customer|frequent\s*customer/.test(q)) {
    const rows = (await pool.query("SELECT customer_name, COUNT(*) as purchases, COALESCE(SUM(sale_price), 0) as spent FROM product_sales WHERE tenant_id = $1 GROUP BY customer_name ORDER BY purchases DESC LIMIT 5", [tenantId])).rows as { customer_name: string; purchases: number; spent: number }[];
    if (rows.length === 0) return { text: 'No customer purchases recorded yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.customer_name}\n   ${r.purchases} purchases - ${r.spent.toLocaleString()} spent`).join('\n');
    return { text: `*Top Customers*\n\n${list}` };
  }

  // ============ FINANCE / REVENUE ============
  if (/total\s*revenue|all\s*time\s*revenue|overall\s*revenue/.test(q)) {
    const saleRevenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE tenant_id = $1", [tenantId])).rows[0] as { t: number }).t;
    return { text: `*Total Revenue*\n\n- Product sales: ${saleRevenue.toLocaleString()}` };
  }

  if (/today\s*revenue|revenue\s*today/.test(q)) {
    const today = new Date().toISOString().slice(0, 10);
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { t: number }).t;
    return { text: `*Today's Revenue*: ${revenue.toLocaleString()}` };
  }

  // ============ WARRANTY ============
  if (/active\s*warrant|warranty\s*count|how\s*many\s*warrant/.test(q)) {
    const active = ((await pool.query("SELECT COUNT(*) as c FROM warranties WHERE status = 'Active' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const expired = ((await pool.query("SELECT COUNT(*) as c FROM warranties WHERE status = 'Expired' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const claimed = ((await pool.query("SELECT COUNT(*) as c FROM warranties WHERE status = 'Under Claim' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    return { text: `*Warranty Summary*\n\n- Active: ${active}\n- Expired: ${expired}\n- Under Claim: ${claimed}\n- Total: ${active + expired + claimed}` };
  }

  if (/expir(ing|e)\s*warrant|warranty\s*expir/.test(q)) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = (await pool.query("SELECT barcode, customer_name, expiry_date FROM warranties WHERE status = 'Active' AND expiry_date BETWEEN $1 AND (CAST($1 AS DATE) + INTERVAL '30 days') AND tenant_id = $2 ORDER BY expiry_date LIMIT 10", [today, tenantId])).rows as { barcode: string; customer_name: string; expiry_date: string }[];
    if (rows.length === 0) return { text: 'No warranties expiring in the next 30 days.' };
    const list = rows.map((r) => `- ${r.customer_name} (${r.barcode})\n  Expires: ${r.expiry_date}`).join('\n');
    return { text: `*Warranties Expiring Soon*\n\n${list}` };
  }

  if (/warranty\s*claim|under\s*claim|claimed\s*warrant/.test(q)) {
    const rows = (await pool.query("SELECT barcode, customer_name, activation_date FROM warranties WHERE status = 'Under Claim' AND tenant_id = $1 ORDER BY activation_date DESC LIMIT 10", [tenantId])).rows as { barcode: string; customer_name: string; activation_date: string }[];
    if (rows.length === 0) return { text: 'No warranty claims pending.' };
    const list = rows.map((r) => `- ${r.customer_name} (${r.barcode})\n  Activated: ${r.activation_date}`).join('\n');
    return { text: `*Warranty Claims* (${rows.length})\n\n${list}` };
  }

  // ============ REWARDS ============
  if (/reward\s*point|total\s*reward|point\s*summary/.test(q)) {
    const earned = ((await pool.query("SELECT COALESCE(SUM(points), 0) as t FROM rewards WHERE type = 'Earned' AND tenant_id = $1", [tenantId])).rows[0] as { t: number }).t;
    const redeemed = ((await pool.query("SELECT COALESCE(SUM(points), 0) as t FROM rewards WHERE type = 'Redeemed' AND tenant_id = $1", [tenantId])).rows[0] as { t: number }).t;
    return { text: `*Reward Points Summary*\n\n- Total Earned: ${earned.toLocaleString()} pts\n- Redeemed: ${redeemed.toLocaleString()} pts\n- Balance: ${(earned - redeemed).toLocaleString()} pts` };
  }

  if (/top\s*earner|most\s*point|reward\s*leader/.test(q)) {
    const rows = (await pool.query("SELECT name, total_reward_points as pts, total_sales FROM vendors WHERE id != 'OWNER' AND total_reward_points > 0 AND tenant_id = $1 ORDER BY total_reward_points DESC LIMIT 5", [tenantId])).rows as { name: string; pts: number; total_sales: number }[];
    if (rows.length === 0) return { text: 'No reward points earned yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.name}\n   ${r.pts} pts - ${r.total_sales} sales`).join('\n');
    return { text: `*Top Reward Earners*\n\n${list}` };
  }

  // ============ REPLACEMENTS ============
  if (/replacement|replaced\s*product|warranty\s*replace/.test(q)) {
    const count = ((await pool.query("SELECT COUNT(*) as c FROM product_replacements WHERE tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const rows = (await pool.query("SELECT old_barcode, new_barcode, customer_name, replaced_date FROM product_replacements WHERE tenant_id = $1 ORDER BY replaced_date DESC LIMIT 5", [tenantId])).rows as { old_barcode: string; new_barcode: string; customer_name: string; replaced_date: string }[];
    if (count === 0) return { text: 'No product replacements recorded.' };
    const list = rows.map((r) => `- ${r.customer_name}\n  ${r.old_barcode} -> ${r.new_barcode} (${r.replaced_date})`).join('\n');
    return { text: `*Replacements* (${count} total)\n\n${list}` };
  }

  // ============ BANKS ============
  if (/bank\s*account|bank\s*detail|list\s*bank|show\s*bank/.test(q)) {
    const rows = (await pool.query("SELECT name, bank_name, account_number, branch, ifsc_code FROM banks WHERE tenant_id = $1 ORDER BY name", [tenantId])).rows as { name: string; bank_name: string; account_number: string; branch: string; ifsc_code: string }[];
    if (rows.length === 0) return { text: 'No bank accounts found.' };
    const list = rows.map((r) => `- *${r.name}*\n  ${r.bank_name} | A/C: ${r.account_number}\n  ${r.branch} | IFSC: ${r.ifsc_code}`).join('\n');
    return { text: `*Bank Accounts*\n\n${list}` };
  }

  // ============ REPORTS ============
  if (/daily\s*report|today\s*report|today\s*summary/.test(q)) {
    const today = new Date().toISOString().slice(0, 10);
    const sales = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { t: number }).t;
    const distributedCount = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE distribution_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { c: number }).c;
    const inStock = ((await pool.query("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'InStock' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const pendingPaymentsCount = ((await pool.query(`
      SELECT COUNT(*) as c FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1 AND
        COALESCE((SELECT SUM(COALESCE(pd.billed_price,pd.net_price,p.price)) FROM product_distribution pd JOIN products p ON pd.product_id=p.id WHERE pd.vendor_id=v.id AND pd.tenant_id=$1),0)
        > COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id=v.id AND tenant_id=$1),0)
    `, [tenantId])).rows[0] as { c: number });
    return { text: `*Daily Report* (${today})\n\n${salesLbl}: ${sales} (${revenue.toLocaleString()})\n${distLbl}: ${distributedCount} units\nIn stock: ${inStock} units\nVendors with dues: ${pendingPaymentsCount.c}` };
  }

  if (/monthly\s*report|month\s*summary|this\s*month\s*report/.test(q)) {
    const month = new Date().toISOString().slice(0, 7);
    const sales = ((await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { c: number }).c;
    const revenue = ((await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { t: number }).t;
    const distributedCount = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE distribution_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { c: number }).c;
    const payments = ((await pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE payment_date LIKE $1 AND tenant_id = $2", [`${month}%`, tenantId])).rows[0] as { t: number }).t;
    return { text: `*Monthly Report* (${month})\n\n${salesLbl}: ${sales} units\nRevenue: ${revenue.toLocaleString()}\n${distLbl}: ${distributedCount} units\nPayments Received: ${payments.toLocaleString()}` };
  }

  if (/vendor\s*report|vendor\s*summary|vendor\s*overview/.test(q)) {
    const rows = (await pool.query(`
      SELECT v.name, v.total_sales,
        (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id AND tenant_id = $1) as distributed,
        (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id AND status = 'Distributed' AND tenant_id = $1) as with_vendor,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price,pd.net_price,p.price)) FROM product_distribution pd JOIN products p ON pd.product_id=p.id WHERE pd.vendor_id=v.id AND pd.tenant_id=$1),0) as billed,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id=v.id AND tenant_id=$1),0) as paid
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1 ORDER BY v.total_sales DESC
    `, [tenantId])).rows as { name: string; total_sales: number; distributed: number; with_vendor: number; billed: number; paid: number }[];
    if (rows.length === 0) return { text: 'No vendors found.' };
    const list = rows.map((r) => `- *${r.name}*\n  ${r.distributed} distributed | ${r.total_sales} sold | ${r.with_vendor} with vendor\n  Billed: ${r.billed.toLocaleString()} | Paid: ${r.paid.toLocaleString()} | Due: ${(r.billed - r.paid).toLocaleString()}`).join('\n');
    return { text: `*Vendor Report*\n\n${list}` };
  }

  // ============ DISTRIBUTION SUMMARY ============
  if (/distribution\s*summary|distributed\s*today|how\s*much\s*distributed/.test(q)) {
    const total = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const withVendor = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE status = 'Distributed' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    const soldDist = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE status = 'Sold' AND tenant_id = $1", [tenantId])).rows[0] as { c: number }).c;
    return { text: `*${distLbl} Summary*\n\n- Total dispatched: ${total}\n- With vendors: ${withVendor}\n- Sold by vendors: ${soldDist}` };
  }

  // ============ BARCODE LOOKUP ============
  const barcodeMatch = q.match(/^[A-Z]{2,}[0-9]+$/i) || q.match(/^[A-Z]+-[A-Z0-9-]+$/i);
  if (barcodeMatch) {
    const barcode = barcodeMatch[0].toUpperCase();
    const inv = (await pool.query("SELECT pi.barcode, pi.status, p.name as product_name, p.price FROM product_inventory pi JOIN products p ON pi.product_id = p.id WHERE pi.barcode = $1 AND pi.tenant_id = $2", [barcode, tenantId])).rows[0] as { barcode: string; status: string; product_name: string; price: number } | undefined;
    if (inv) {
      let extra = '';
      if (inv.status === 'Distributed') {
        const dist = (await pool.query("SELECT v.name, pd.distribution_date FROM product_distribution pd JOIN vendors v ON pd.vendor_id = v.id WHERE pd.barcode = $1 AND pd.tenant_id = $2", [barcode, tenantId])).rows[0] as { name: string; distribution_date: string } | undefined;
        extra = dist ? `\n- With: ${dist.name}\n- Since: ${dist.distribution_date}` : '';
      }
      if (inv.status === 'Sold') {
        const sale = (await pool.query("SELECT customer_name, customer_phone, purchase_date, sale_price, vendor_id FROM product_sales WHERE barcode = $1 AND tenant_id = $2", [barcode, tenantId])).rows[0] as { customer_name: string; customer_phone: string; purchase_date: string; sale_price: number; vendor_id: string } | undefined;
        if (sale) {
          const vendor = (await pool.query("SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2", [sale.vendor_id, tenantId])).rows[0] as { name: string } | undefined;
          extra = `\n- Sold to: ${sale.customer_name} (${sale.customer_phone})\n- Date: ${sale.purchase_date}\n- Price: ${(sale.sale_price ?? 0).toLocaleString()}\n- Via: ${vendor?.name ?? 'Owner'}`;
        }
      }
      const warranty = (await pool.query("SELECT status, expiry_date FROM warranties WHERE barcode = $1 AND tenant_id = $2 ORDER BY activation_date DESC LIMIT 1", [barcode, tenantId])).rows[0] as { status: string; expiry_date: string } | undefined;
      if (warranty) extra += `\n- Warranty: ${warranty.status} (expires ${warranty.expiry_date})`;
      return { text: `*Barcode: ${barcode}*\n\n- Product: ${inv.product_name}\n- Status: ${inv.status}\n- MRP: ${inv.price.toLocaleString()}${extra}` };
    }
    return { text: `Barcode *${barcode}* not found in inventory.` };
  }

  // ============ VENDOR LOOKUP (fuzzy) ============
  const vendorRows = (await pool.query("SELECT id, name, phone, contact_person FROM vendors WHERE id != 'OWNER' AND (LOWER(name) LIKE $1 OR LOWER(contact_person) LIKE $1) AND tenant_id = $2", [`%${q}%`, tenantId])).rows as { id: string; name: string; phone: string; contact_person: string }[];
  if (vendorRows.length === 1) {
    const v = vendorRows[0];
    const totalVal = ((await pool.query("SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = $1 AND pd.tenant_id = $2", [v.id, tenantId])).rows[0] as { t: number }).t;
    const totalPaid = ((await pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2", [v.id, tenantId])).rows[0] as { t: number }).t;
    const balance = totalVal - totalPaid;
    const distCount = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2", [v.id, tenantId])).rows[0] as { c: number }).c;
    const soldCount = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND status = 'Sold' AND tenant_id = $2", [v.id, tenantId])).rows[0] as { c: number }).c;
    const withVendor = ((await pool.query("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND status = 'Distributed' AND tenant_id = $2", [v.id, tenantId])).rows[0] as { c: number }).c;
    const recentSales = (await pool.query("SELECT p.name, ps.customer_name, ps.purchase_date FROM product_sales ps JOIN products p ON ps.product_id = p.id WHERE ps.vendor_id = $1 AND ps.tenant_id = $2 ORDER BY ps.purchase_date DESC LIMIT 3", [v.id, tenantId])).rows as { name: string; customer_name: string; purchase_date: string }[];
    const salesList = recentSales.length > 0 ? `\n\n*Recent Sales*\n${recentSales.map((s) => `- ${s.name} -> ${s.customer_name} (${s.purchase_date})`).join('\n')}` : '';
    return {
      text: `*${v.name}*\n${v.contact_person ? `Contact: ${v.contact_person}\n` : ''}${v.phone ? `Phone: ${v.phone}\n` : ''}\n*Stock*\n- Distributed: ${distCount}\n- With vendor: ${withVendor}\n- Sold: ${soldCount}\n\n*Finance*\n- Billed: ${totalVal.toLocaleString()}\n- Paid: ${totalPaid.toLocaleString()}\n- Balance: ${balance.toLocaleString()}${salesList}`,
    };
  }
  if (vendorRows.length > 1) {
    const list = vendorRows.map((v) => `- ${v.name}${v.phone ? ` (${v.phone})` : ''}`).join('\n');
    return { text: `Found ${vendorRows.length} vendors matching "${input}":\n\n${list}\n\nType the exact name for details.` };
  }

  // ============ CUSTOMER LOOKUP (fuzzy) ============
  const custRows = (await pool.query("SELECT id, name, phone FROM customers WHERE LOWER(name) LIKE $1 AND tenant_id = $2 LIMIT 5", [`%${q}%`, tenantId])).rows as { id: string; name: string; phone: string }[];
  if (custRows.length === 1) {
    const c = custRows[0];
    const purchaseRows = (await pool.query("SELECT p.name, ps.purchase_date, ps.sale_price FROM product_sales ps JOIN products p ON ps.product_id = p.id WHERE (ps.customer_id = $1 OR (ps.customer_id IS NULL AND ps.customer_phone = $2)) AND ps.tenant_id = $3 ORDER BY ps.purchase_date DESC LIMIT 5", [c.id, c.phone ?? '', tenantId])).rows as { name: string; purchase_date: string; sale_price: number }[];
    const purchaseList = purchaseRows.length > 0 ? purchaseRows.map((p) => `- ${p.name} -- ${p.purchase_date} (${(p.sale_price ?? 0).toLocaleString()})`).join('\n') : 'No purchases recorded';
    const vendor = (await pool.query("SELECT v.name FROM customers c JOIN vendors v ON c.vendor_id = v.id WHERE c.id = $1 AND c.tenant_id = $2", [c.id, tenantId])).rows[0] as { name: string } | undefined;
    return { text: `*${c.name}*\n${c.phone ? `Phone: ${c.phone}\n` : ''}${vendor ? `Vendor: ${vendor.name}\n` : 'Direct customer\n'}\n*Purchases*\n${purchaseList}` };
  }
  if (custRows.length > 1) {
    const list = custRows.map((c) => `- ${c.name}${c.phone ? ` (${c.phone})` : ''}`).join('\n');
    return { text: `Found ${custRows.length} customers matching "${input}":\n\n${list}` };
  }

  // ============ THANK YOU ============
  if (/thank|thanks|dhanyawad|shukriya/.test(q)) {
    return { text: `You're welcome! Let me know if you need anything else.` };
  }

  // ============ NOTHING MATCHED ============
  return { text: `I couldn't find anything for "${input}".\n\nTry:\n- A vendor or customer name\n- A barcode (e.g. SUB1H001)\n- "sales today"\n- "low stock"\n- "pending payments"\n- "daily report"\n- "help" for all commands` };
}

router.get('/api/chatbot/quick-actions', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const tenantRow = (await pool.query('SELECT tab_config FROM tenants WHERE id = $1', [tenantId])).rows[0] as { tab_config: TabConfig | null } | undefined;
    const tc = tenantRow?.tab_config ?? null;
    const actions: string[] = ['daily report'];
    if (tc?.sales?.visible !== false || tc?.distribution?.visible !== false) {
      const label = (tc?.sales?.visible === false && tc?.distribution?.label) ? tc.distribution.label.toLowerCase() : 'sales';
      actions.push(`${label} today`);
    }
    actions.push('low stock', 'pending payments');
    if (tc?.distribution?.visible !== false) actions.push(`${tabLabel(tc, 'distribution', 'distribution').toLowerCase()} summary`);
    actions.push('all vendors');
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/chatbot', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
    const tenantRow = (await pool.query('SELECT tab_config FROM tenants WHERE id = $1', [tenantId])).rows[0] as { tab_config: TabConfig | null } | undefined;
    const tabConfig = tenantRow?.tab_config ?? null;
    const response = await query(message, tenantId, tabConfig);
    res.json(response);
  } catch (err) {
    res.status(500).json({ text: 'Something went wrong. Please try again.', error: String(err) });
  }
});

export default router;
