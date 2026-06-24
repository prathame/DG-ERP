import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Open a print window immediately (must be called from click handler, not async callback) */
export function openPrintWindow(): Window | null {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (win) {
    win.document.write('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#999;"><p>Preparing bill...</p></body></html>');
    win.document.close();
  }
  return win;
}

/** Write bill HTML to an already-opened print window and trigger print */
export function printBillInWindow(win: Window, html: string) {
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

/** Convenience: open window + write + print (only works if called synchronously from click) */
export function printBill(html: string) {
  const win = openPrintWindow();
  if (!win) return;
  printBillInWindow(win, html);
}

/** Open bill HTML in a new tab for saving as PDF */
export function saveBillAsPdf(html: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

/** Normalize Indian phone number for WhatsApp (strip formatting, prepend 91 if needed) */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-().+]/g, '');
  if (p.length === 10 && /^\d+$/.test(p)) p = '91' + p;
  if (p.startsWith('0')) p = '91' + p.slice(1);
  return p;
}

/** Open WhatsApp Web with pre-filled message */
export function shareViaWhatsApp(phone: string, message: string) {
  const p = normalizePhone(phone);
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(message)}`, '_blank');
}

/** Open mailto: link for email */
export function shareViaEmail(email: string, subject: string, body: string) {
  window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
}

/** Format sales invoice as plain text for WhatsApp / Email */
export function formatSalesInvoiceText(bill: {
  id: string; barcode: string; productName: string; category?: string | null;
  salePrice: number; warrantyMonths: number; purchaseDate: string;
  customerName: string; customerPhone: string; customerEmail?: string | null;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  warranty?: { expiryDate: string } | null;
  company: { name: string; phone?: string | null; address?: string | null };
  rewardPointsEarned: number;
}): string {
  const lines = [
    `📄 *SALES INVOICE*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Invoice: ${bill.id}`,
    `Date: ${bill.purchaseDate}`,
    `Company: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*PRODUCT*`,
    `• ${bill.productName}`,
    `• Barcode: ${bill.barcode}`,
    bill.category ? `• Category: ${bill.category}` : '',
    `• Price: ₹${Number(bill.salePrice).toLocaleString()}`,
    ``,
    `*CUSTOMER*`,
    `• ${bill.customerName}`,
    `• Phone: ${bill.customerPhone}`,
    bill.customerEmail ? `• Email: ${bill.customerEmail}` : '',
    ``,
    `*SOLD BY*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• Contact: ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*WARRANTY*: ${bill.warrantyMonths} months`,
    bill.warranty ? `• Valid till: ${bill.warranty.expiryDate}` : '',
    bill.rewardPointsEarned > 0 ? `\n🎁 Reward Points Earned: ${bill.rewardPointsEarned}` : '',
    ``,
    `Thank you for your purchase!`,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Format distribution challan as plain text for WhatsApp / Email */
export function formatDistributionChallanText(bill: {
  challanId: string; distributionDate: string;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  company: { name: string; phone?: string | null; address?: string | null };
  items: { sno: number; barcode: string; productName: string }[];
  totalQuantity: number; totalValue: number;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
}): string {
  const itemLines = bill.items.map((item) => `${item.sno}. ${item.barcode} — ${item.productName}`);
  const lines = [
    `📦 *DISTRIBUTION CHALLAN*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Challan: ${bill.challanId}`,
    `Date: ${bill.distributionDate}`,
    `From: ${bill.company.name}`,
    bill.company.address ? `Address: ${bill.company.address}` : '',
    bill.company.phone ? `Phone: ${bill.company.phone}` : '',
    ``,
    `*TO VENDOR*`,
    `• ${bill.vendor.name}`,
    bill.vendor.contactPerson ? `• ${bill.vendor.contactPerson}` : '',
    bill.vendor.phone ? `• Phone: ${bill.vendor.phone}` : '',
    ``,
    `*ITEMS (${bill.totalQuantity} units)*`,
    ...itemLines,
    ``,
    `Total Value: ₹${bill.totalValue.toLocaleString()}`,
    bill.payment ? `\n💰 *PAYMENT STATUS*\nTotal Owed: ₹${bill.payment.totalDistributedValue.toLocaleString()}\nPaid: ₹${bill.payment.totalPaid.toLocaleString()}\nBalance: ₹${bill.payment.balance.toLocaleString()}` : '',
    ``,
    `— ${bill.company.name} ERP`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Escape CSV value (wrap in quotes if contains comma, newline, or quote) */
function escapeCsv(val: unknown): string {
  const s = String(val ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export array of objects to CSV and trigger download */
export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = [headers.map(escapeCsv).join(','), ...data.map((r) => headers.map((h) => escapeCsv(r[h])).join(','))];
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
