import { Router } from 'express';
import { db } from '../db';

const router = Router();

interface ChatResponse {
  text: string;
  data?: Record<string, unknown>;
}

function query(input: string): ChatResponse {
  const q = input.trim().toLowerCase();

  // Greetings
  if (/^(hi|hello|hey|namaste|hii+)$/i.test(q)) {
    return { text: `Hello! I'm your ERP assistant. Try asking:\n• Vendor name (e.g. "Rajesh Electricals")\n• "low stock"\n• "sales today"\n• "pending payments"\n• A barcode (e.g. "SUB1H001")\n• "top products"\n• "help"` };
  }

  if (/^(help|commands|what can you do)/.test(q)) {
    return { text: `Here's what I can do:\n\n📦 *Inventory*\n• "low stock" — products running low\n• "total inventory" — overall stock count\n\n💰 *Sales*\n• "sales today" — today's sales\n• "sales this month" — monthly sales\n• "top products" — best sellers\n\n🏪 *Vendors*\n• Type any vendor name to see their details\n• "pending payments" — who owes money\n• "all vendors" — list all vendors\n\n🔍 *Lookup*\n• Type any barcode to check status\n• Type customer name to find purchases` };
  }

  // Sales today
  if (/sales\s*today/.test(q)) {
    const today = new Date().toISOString().slice(0, 10);
    const count = (db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = ?").get(today) as { c: number }).c;
    const revenue = (db.prepare("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date = ?").get(today) as { t: number }).t;
    return { text: `📊 *Sales Today* (${today})\n\n• ${count} sale${count !== 1 ? 's' : ''}\n• Revenue: ₹${revenue.toLocaleString()}`, data: { count, revenue } };
  }

  // Sales this month
  if (/sales\s*(this\s*)?month/.test(q)) {
    const month = new Date().toISOString().slice(0, 7);
    const count = (db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date LIKE ?").get(`${month}%`) as { c: number }).c;
    const revenue = (db.prepare("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date LIKE ?").get(`${month}%`) as { t: number }).t;
    return { text: `📊 *Sales This Month*\n\n• ${count} sale${count !== 1 ? 's' : ''}\n• Revenue: ₹${revenue.toLocaleString()}`, data: { count, revenue } };
  }

  // Top products
  if (/top\s*product|best\s*sell|popular/.test(q)) {
    const rows = db.prepare("SELECT p.name, COUNT(ps.id) as sold FROM product_sales ps JOIN products p ON ps.product_id = p.id GROUP BY ps.product_id ORDER BY sold DESC LIMIT 5").all() as { name: string; sold: number }[];
    if (rows.length === 0) return { text: 'No sales recorded yet.' };
    const list = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.sold} sold`).join('\n');
    return { text: `🏆 *Top Selling Products*\n\n${list}` };
  }

  // Low stock
  if (/low\s*stock|stock\s*alert|out\s*of\s*stock/.test(q)) {
    const rows = db.prepare(`
      SELECT p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock'
      GROUP BY p.id HAVING stock < 10 ORDER BY stock ASC LIMIT 10
    `).all() as { name: string; stock: number }[];
    if (rows.length === 0) return { text: '✅ All products have sufficient stock (10+ units each).' };
    const list = rows.map((r) => `• ${r.name} — ${r.stock === 0 ? '❌ OUT OF STOCK' : `⚠️ ${r.stock} left`}`).join('\n');
    return { text: `📦 *Low Stock Alert*\n\n${list}` };
  }

  // Total inventory
  if (/total\s*(inventory|stock)|inventory\s*count|how\s*many\s*product/.test(q)) {
    const total = (db.prepare("SELECT COUNT(*) as c FROM product_inventory").get() as { c: number }).c;
    const inStock = (db.prepare("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'InStock'").get() as { c: number }).c;
    const distributed = (db.prepare("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'Distributed'").get() as { c: number }).c;
    const sold = (db.prepare("SELECT COUNT(*) as c FROM product_inventory WHERE status = 'Sold'").get() as { c: number }).c;
    return { text: `📦 *Inventory Summary*\n\n• Total: ${total} units\n• With Admin: ${inStock}\n• With Vendors: ${distributed}\n• Sold: ${sold}` };
  }

  // Pending payments
  if (/pending\s*payment|who\s*owe|outstanding|due\s*payment/.test(q)) {
    const rows = db.prepare(`
      SELECT v.name,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id), 0) as total_val,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id), 0) as paid
      FROM vendors v WHERE v.id != 'OWNER'
      HAVING (total_val - paid) > 0
      ORDER BY (total_val - paid) DESC LIMIT 10
    `).all() as { name: string; total_val: number; paid: number }[];
    if (rows.length === 0) return { text: '✅ No pending payments. All vendors are settled!' };
    const list = rows.map((r) => `• ${r.name}: ₹${(r.total_val - r.paid).toLocaleString()} due`).join('\n');
    const totalDue = rows.reduce((s, r) => s + (r.total_val - r.paid), 0);
    return { text: `💰 *Pending Payments*\n\n${list}\n\nTotal Outstanding: ₹${totalDue.toLocaleString()}` };
  }

  // All vendors
  if (/all\s*vendor|list\s*vendor|show\s*vendor|vendor\s*list/.test(q)) {
    const rows = db.prepare("SELECT name, phone FROM vendors WHERE id != 'OWNER' ORDER BY name").all() as { name: string; phone: string }[];
    if (rows.length === 0) return { text: 'No vendors found.' };
    const list = rows.map((r) => `• ${r.name}${r.phone ? ` (${r.phone})` : ''}`).join('\n');
    return { text: `🏪 *All Vendors (${rows.length})*\n\n${list}` };
  }

  // Barcode lookup
  const barcodeMatch = q.match(/^[A-Z0-9]+-?[A-Z0-9]*\d+$/i);
  if (barcodeMatch || /barcode|scan/.test(q)) {
    const barcode = barcodeMatch ? barcodeMatch[0].toUpperCase() : q.replace(/barcode|scan|check|status/gi, '').trim().toUpperCase();
    if (barcode) {
      const inv = db.prepare(`
        SELECT pi.barcode, pi.status, p.name as product_name, p.price
        FROM product_inventory pi JOIN products p ON pi.product_id = p.id
        WHERE pi.barcode = ?
      `).get(barcode) as { barcode: string; status: string; product_name: string; price: number } | undefined;
      if (inv) {
        let extra = '';
        if (inv.status === 'Distributed') {
          const dist = db.prepare("SELECT v.name FROM product_distribution pd JOIN vendors v ON pd.vendor_id = v.id WHERE pd.barcode = ?").get(barcode) as { name: string } | undefined;
          extra = dist ? `\n• With Vendor: ${dist.name}` : '';
        }
        if (inv.status === 'Sold') {
          const sale = db.prepare("SELECT customer_name, purchase_date, sale_price FROM product_sales WHERE barcode = ?").get(barcode) as { customer_name: string; purchase_date: string; sale_price: number } | undefined;
          extra = sale ? `\n• Sold to: ${sale.customer_name}\n• Date: ${sale.purchase_date}\n• Price: ₹${sale.sale_price?.toLocaleString() ?? 'N/A'}` : '';
        }
        return { text: `🔍 *Barcode: ${barcode}*\n\n• Product: ${inv.product_name}\n• Status: ${inv.status}\n• MRP: ₹${inv.price.toLocaleString()}${extra}` };
      }
    }
  }

  // Vendor lookup (fuzzy match by name)
  const vendorRows = db.prepare("SELECT id, name, phone, contact_person FROM vendors WHERE id != 'OWNER' AND (LOWER(name) LIKE ? OR LOWER(contact_person) LIKE ?)").all(`%${q}%`, `%${q}%`) as { id: string; name: string; phone: string; contact_person: string }[];
  if (vendorRows.length === 1) {
    const v = vendorRows[0];
    const totalVal = (db.prepare("SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = ?").get(v.id) as { t: number }).t;
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = ?").get(v.id) as { t: number }).t;
    const balance = totalVal - totalPaid;
    const distCount = (db.prepare("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = ?").get(v.id) as { c: number }).c;
    const soldCount = (db.prepare("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = ? AND status = 'Sold'").get(v.id) as { c: number }).c;
    const withVendor = (db.prepare("SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = ? AND status = 'Distributed'").get(v.id) as { c: number }).c;
    return {
      text: `🏪 *${v.name}*\n${v.contact_person ? `Contact: ${v.contact_person}\n` : ''}${v.phone ? `Phone: ${v.phone}\n` : ''}\n📦 *Distribution*\n• Total distributed: ${distCount}\n• With vendor: ${withVendor}\n• Sold: ${soldCount}\n\n💰 *Finance*\n• Total Billed: ₹${totalVal.toLocaleString()}\n• Paid: ₹${totalPaid.toLocaleString()}\n• Balance: ₹${balance.toLocaleString()} ${balance > 0 ? '🔴' : '🟢'}`,
      data: { vendorId: v.id, balance }
    };
  }
  if (vendorRows.length > 1) {
    const list = vendorRows.map((v) => `• ${v.name}${v.phone ? ` (${v.phone})` : ''}`).join('\n');
    return { text: `Found ${vendorRows.length} vendors matching "${input}":\n\n${list}\n\nType the exact name for details.` };
  }

  // Customer lookup
  const custRows = db.prepare("SELECT id, name, phone FROM customers WHERE LOWER(name) LIKE ? LIMIT 5").all(`%${q}%`) as { id: string; name: string; phone: string }[];
  if (custRows.length === 1) {
    const c = custRows[0];
    const purchases = db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE customer_id = ? OR (customer_id IS NULL AND customer_phone = ?)").get(c.id, c.phone ?? '') as { c: number };
    return { text: `👤 *${c.name}*\n${c.phone ? `Phone: ${c.phone}\n` : ''}\n• ${purchases.c} purchase${purchases.c !== 1 ? 's' : ''} recorded` };
  }
  if (custRows.length > 1) {
    const list = custRows.map((c) => `• ${c.name}${c.phone ? ` (${c.phone})` : ''}`).join('\n');
    return { text: `Found ${custRows.length} customers matching "${input}":\n\n${list}` };
  }

  // Nothing matched
  return { text: `I couldn't understand "${input}". Try:\n• A vendor name\n• A barcode\n• "sales today"\n• "low stock"\n• "pending payments"\n• "help" for all commands` };
}

router.post('/api/chatbot', (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
    const response = query(message);
    res.json(response);
  } catch (err) {
    res.status(500).json({ text: 'Something went wrong. Please try again.', error: String(err) });
  }
});

export default router;
