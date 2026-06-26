import type { SaleBillData, DistributionBillData } from '../api';

function esc(text: unknown): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeColor(c: string | null | undefined): string {
  if (!c) return '#F27D26';
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#F27D26';
}

function safeImgSrc(src: unknown): string {
  if (!src || typeof src !== 'string') return '';
  if (src.startsWith('data:image/')) return src;
  return '';
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function buildDistributionBillSlice(
  bill: DistributionBillData,
  items: DistributionBillData['items'],
  totalValue: number,
): DistributionBillData {
  const groups: Record<string, { productName: string; barcodes: string[]; originalPrice: number; discountPercent: number; netPrice: number }> = {};
  for (const item of items) {
    const key = item.productName;
    if (!groups[key]) {
      groups[key] = {
        productName: item.productName,
        barcodes: [],
        originalPrice: item.originalPrice,
        discountPercent: item.discountPercent,
        netPrice: item.price,
      };
    }
    groups[key].barcodes.push(item.barcode);
  }
  const groupedItems = Object.values(groups).map((g, i) => {
    const sorted = [...g.barcodes].sort();
    return {
      sno: i + 1,
      productName: g.productName,
      barcodeRange: sorted.length === 1 ? sorted[0] : `${sorted[0]} – ${sorted[sorted.length - 1]}`,
      quantity: sorted.length,
      originalPrice: g.originalPrice,
      discountPercent: g.discountPercent,
      netPrice: g.netPrice,
      lineTotal: g.netPrice * sorted.length,
    };
  });
  const grossValue = items.reduce((s, i) => s + (i.originalPrice || 0), 0);
  return {
    ...bill,
    items: items.map((item, i) => ({ ...item, sno: i + 1 })),
    groupedItems,
    totalQuantity: items.length,
    grossValue,
    totalDiscount: grossValue - totalValue,
    totalValue,
    payment: undefined,
  };
}

export function generateSalesInvoiceHtml(bill: SaleBillData, options?: { showGst?: boolean }): string {
  const showGst = options?.showGst ?? true;
  const billConfig = (bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined ?? {};
  const color = safeColor(billConfig.primaryColor as string);
  const logoHtml = billConfig.logoBase64
    ? `<img src="${safeImgSrc(billConfig.logoBase64)}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div class="logo-icon">${(bill.company.name || 'C').substring(0, 1).toUpperCase()}</div>`;
  const tagline = (billConfig.tagline as string) || '';
  const invPrefix = (billConfig.invoicePrefix as string) || '';
  const showWarranty = billConfig.showWarranty !== false;
  const showRewards = billConfig.showRewards !== false;
  const showBarcode = billConfig.showBarcode !== false;
  const footerText = (billConfig.footerText as string) || 'Powered by DG ERP Management';

  const warrantySection = (showWarranty && bill.warranty) ? `
    <div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <strong style="color:#166534;">Warranty Information</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">
        <tr><td style="color:#6b7280;">Duration</td><td><strong>${bill.warrantyMonths} months</strong></td>
            <td style="color:#6b7280;">Status</td><td><strong>${bill.warranty.status}</strong></td></tr>
        <tr><td style="color:#6b7280;">Activation</td><td>${fmtDate(bill.warranty.activationDate)}</td>
            <td style="color:#6b7280;">Expiry</td><td>${fmtDate(bill.warranty.expiryDate)}</td></tr>
      </table>
    </div>` : '';

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const bankSection = hasBankDetails ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <strong style="font-size:13px;">Bank Details</strong>
      <table style="width:100%;margin-top:8px;font-size:12px;">
        ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>
    </div>` : '';

  const tcSection = billConfig.termsAndConditions ? `
    <div style="margin-top:16px;font-size:11px;">
      <strong>Terms & Conditions:</strong>
      <p style="white-space:pre-line;color:#6b7280;margin-top:4px;">${esc(billConfig.termsAndConditions)}</p>
    </div>` : '';

  const sigSection = billConfig.signatoryName ? `
    <div style="margin-top:40px;text-align:right;">
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:50px;margin-bottom:4px;" />` : '<div style="height:50px;"></div>'}
      <p style="font-weight:600;font-size:13px;">${esc(billConfig.signatoryName)}</p>
      ${billConfig.signatoryDesignation ? `<p style="font-size:11px;color:#6b7280;">${esc(billConfig.signatoryDesignation)}</p>` : ''}
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Invoice - ${invPrefix}${bill.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto;}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${color};padding-bottom:20px;margin-bottom:24px;}
  .logo{display:flex;align-items:center;gap:12px;}
  .logo-icon{width:48px;height:48px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px;}
  .company-name{font-size:24px;font-weight:bold;letter-spacing:1px;}
  .company-details{font-size:12px;color:#6b7280;text-align:right;}
  .invoice-title{font-size:20px;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;}
  .info-box{padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;}
  .info-box h4{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px;}
  .info-box p{font-size:13px;margin:2px 0;}
  table.items{width:100%;border-collapse:collapse;margin-top:16px;}
  table.items th{background:#151619;color:white;padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
  table.items td{padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;}
  table.items tr:last-child td{border-bottom:none;}
  .totals{margin-top:16px;text-align:right;}
  .totals .row{display:flex;justify-content:flex-end;gap:40px;padding:6px 16px;font-size:14px;}
  .totals .total-row{font-size:18px;font-weight:bold;color:${color};border-top:2px solid ${color};padding-top:10px;margin-top:6px;}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;}
  .reward-badge{display:inline-block;margin-top:12px;padding:6px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:20px;font-size:12px;font-weight:600;color:#92400e;}
  @media print{body{padding:20px;} .no-print{display:none;}}
</style></head><body>
  <div class="header">
    <div class="logo">
      ${logoHtml}
      <div>
        <div class="company-name">${esc(bill.company.name)}</div>
        ${tagline ? `<div style="font-size:11px;color:#6b7280;">${esc(tagline)}</div>` : ''}
      </div>
    </div>
    <div class="company-details">
      ${bill.company.address ? `<div>${esc(bill.company.address)}</div>` : ''}
      ${bill.company.phone ? `<div>Phone: ${esc(bill.company.phone)}</div>` : ''}
      ${showGst && bill.company.gstNumber ? `<div style="font-weight:600;">GSTIN: ${esc(bill.company.gstNumber)}</div>` : ''}
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <div class="invoice-title">${showGst ? 'Tax Invoice' : 'Invoice'}</div>
    <div style="text-align:right;font-size:13px;">
      <div><strong>Invoice No:</strong> ${invPrefix}${bill.id}</div>
      <div><strong>Date:</strong> ${fmtDate(bill.purchaseDate)}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <h4>Bill To (Customer)</h4>
      <p><strong>${esc(bill.customerName)}</strong></p>
      <p>Phone: ${esc(bill.customerPhone)}</p>
      ${bill.customerEmail ? `<p>Email: ${esc(bill.customerEmail)}</p>` : ''}
    </div>
    <div class="info-box">
      <h4>Sold By (Vendor)</h4>
      <p><strong>${esc(bill.vendor.name)}</strong></p>
      ${bill.vendor.contactPerson ? `<p>${esc(bill.vendor.contactPerson)}</p>` : ''}
      ${bill.vendor.phone ? `<p>Phone: ${esc(bill.vendor.phone)}</p>` : ''}
      ${bill.vendor.address ? `<p>${esc(bill.vendor.address)}</p>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr>${showBarcode ? '<th>Barcode</th>' : ''}<th>Product</th>${showGst && bill.hsnCode ? '<th>HSN</th>' : ''}<th>Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>
      <tr>
        ${showBarcode ? `<td style="font-family:monospace;">${esc(bill.barcode)}</td>` : ''}
        <td><strong>${esc(bill.productName)}</strong>${bill.productDescription ? `<br/><span style="color:#6b7280;font-size:11px;">${esc(bill.productDescription)}</span>` : ''}</td>
        ${showGst && bill.hsnCode ? `<td>${esc(bill.hsnCode)}</td>` : ''}
        <td>1</td>
        <td style="text-align:right;">₹${Number(bill.salePrice).toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold;">₹${Number(bill.salePrice).toLocaleString()}</td>
      </tr>
    </tbody>
  </table>
  ${(() => {
    const basePrice = Number(bill.salePrice);
    if (!showGst) {
      return `<div class="totals">
        <div class="row total-row"><span>Total</span><span>₹${basePrice.toLocaleString()}</span></div>
      </div>`;
    }
    const gstRate = bill.gstRate || 18;
    const gstAmount = Math.round(basePrice * gstRate / 100);
    const halfGst = Math.round(gstAmount / 2);
    const grandTotal = basePrice + gstAmount;
    return `<div class="totals">
      <div class="row"><span>Subtotal</span><span>₹${basePrice.toLocaleString()}</span></div>
      <div class="row"><span>CGST @ ${gstRate / 2}%</span><span>₹${halfGst.toLocaleString()}</span></div>
      <div class="row"><span>SGST @ ${gstRate / 2}%</span><span>₹${(gstAmount - halfGst).toLocaleString()}</span></div>
      <div class="row total-row"><span>Grand Total (incl. GST)</span><span>₹${grandTotal.toLocaleString()}</span></div>
    </div>`;
  })()}
  ${warrantySection}
  ${showRewards && bill.rewardPointsEarned > 0 ? `<div style="text-align:center;"><span class="reward-badge">+${bill.rewardPointsEarned} Reward Points Earned</span></div>` : ''}
  ${bankSection}
  ${tcSection}
  ${sigSection}
  <div class="footer">
    <p>Thank you for your purchase!</p>
    <p style="margin-top:4px;">This is a computer-generated invoice. No signature required.</p>
    <p style="margin-top:8px;font-size:9px;color:#c0c0c0;">${esc(footerText)}</p>
  </div>
</body></html>`;
}

export function generateDistributionChallanHtml(bill: DistributionBillData, options?: { showGst?: boolean; fullyPaid?: boolean }): string {
  const showGst = options?.showGst ?? true;
  const fullyPaid = options?.fullyPaid ?? false;
  const billConfig = (bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined ?? {};
  const color = safeColor(billConfig.primaryColor as string);
  const logoHtml = billConfig.logoBase64
    ? `<img src="${safeImgSrc(billConfig.logoBase64)}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div class="logo-icon">${(bill.company.name || 'C').substring(0, 1).toUpperCase()}</div>`;
  const tagline = (billConfig.tagline as string) || '';
  const chPrefix = (billConfig.challanPrefix as string) || '';
  const footerText = (billConfig.footerText as string) || 'Powered by DG ERP Management';

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const bankSection = hasBankDetails ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <strong style="font-size:13px;">Bank Details</strong>
      <table style="width:100%;margin-top:8px;font-size:12px;">
        ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>
    </div>` : '';

  const tcSection = billConfig.termsAndConditions ? `
    <div style="margin-top:16px;font-size:11px;">
      <strong>Terms & Conditions:</strong>
      <p style="white-space:pre-line;color:#6b7280;margin-top:4px;">${esc(billConfig.termsAndConditions)}</p>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Distribution Challan - ${chPrefix}${bill.challanId}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto;}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${color};padding-bottom:20px;margin-bottom:24px;}
  .logo{display:flex;align-items:center;gap:12px;}
  .logo-icon{width:48px;height:48px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px;}
  .company-name{font-size:24px;font-weight:bold;letter-spacing:1px;}
  .company-details{font-size:12px;color:#6b7280;text-align:right;}
  .challan-title{font-size:20px;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;}
  .info-box{padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;}
  .info-box h4{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px;}
  .info-box p{font-size:13px;margin:2px 0;}
  table.items{width:100%;border-collapse:collapse;margin-top:16px;}
  table.items th{background:#151619;color:white;padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
  table.items td{padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;}
  .summary{margin-top:20px;display:flex;justify-content:flex-end;gap:40px;padding:12px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;}
  .summary strong{color:${color};}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px;padding-top:16px;}
  .sig-box{text-align:center;padding-top:40px;border-top:1px solid #1a1a1a;}
  .sig-box p{font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;}
  .paid-stamp{position:absolute;top:8px;right:0;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:3px solid #059669;color:#059669;background:#ecfdf5;border-radius:8px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;transform:rotate(-12deg);box-shadow:0 2px 8px rgba(5,150,105,0.15);}
  .header-wrap{position:relative;}
  @media print{body{padding:20px;} .no-print{display:none;}}
</style></head><body>
  <div class="header-wrap">
  <div class="header">
    <div class="logo">
      ${logoHtml}
      <div>
        <div class="company-name">${esc(bill.company.name)}</div>
        ${tagline ? `<div style="font-size:11px;color:#6b7280;">${esc(tagline)}</div>` : ''}
      </div>
    </div>
    <div class="company-details">
      ${bill.company.address ? `<div>${esc(bill.company.address)}</div>` : ''}
      ${bill.company.phone ? `<div>Phone: ${esc(bill.company.phone)}</div>` : ''}
      ${showGst && bill.company.gstNumber ? `<div style="font-weight:600;">GSTIN: ${esc(bill.company.gstNumber)}</div>` : ''}
    </div>
  </div>
  ${fullyPaid ? '<div class="paid-stamp">✓ Paid</div>' : ''}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <div class="challan-title">${showGst ? 'Tax Challan' : 'Distribution Challan'}</div>
    <div style="text-align:right;font-size:13px;">
      <div><strong>Challan No:</strong> ${chPrefix}${bill.challanId}</div>
      <div><strong>Date:</strong> ${fmtDate(bill.distributionDate)}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <h4>From (Company)</h4>
      <p><strong>${esc(bill.company.name)}</strong></p>
      ${bill.company.contactName ? `<p>${esc(bill.company.contactName)}</p>` : ''}
      ${bill.company.phone ? `<p>Phone: ${esc(bill.company.phone)}</p>` : ''}
      ${bill.company.address ? `<p>${esc(bill.company.address)}</p>` : ''}
    </div>
    <div class="info-box">
      <h4>To (Vendor)</h4>
      <p><strong>${esc(bill.vendor.name)}</strong></p>
      ${bill.vendor.contactPerson ? `<p>${esc(bill.vendor.contactPerson)}</p>` : ''}
      ${bill.vendor.phone ? `<p>Phone: ${esc(bill.vendor.phone)}</p>` : ''}
      ${bill.vendor.address ? `<p>${esc(bill.vendor.address)}</p>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr><th style="text-align:center;">S.No</th><th>Product</th><th>Barcode Range</th><th style="text-align:center;">Qty</th>${bill.groupedItems.some(g => g.discountPercent > 0) ? '<th style="text-align:right;">MRP</th><th style="text-align:right;">Disc%</th>' : ''}<th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${bill.groupedItems.map((g) => `
      <tr>
        <td style="text-align:center;">${g.sno}</td>
        <td><strong>${esc(g.productName)}</strong></td>
        <td style="font-family:monospace;font-size:12px;">${esc(g.barcodeRange)}</td>
        <td style="text-align:center;">${g.quantity}</td>
        ${bill.groupedItems.some(gi => gi.discountPercent > 0) ? `<td style="text-align:right;">₹${g.originalPrice.toLocaleString()}</td><td style="text-align:right;color:#16a34a;">${g.discountPercent > 0 ? g.discountPercent + '%' : '-'}</td>` : ''}
        <td style="text-align:right;">₹${g.netPrice.toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold;">₹${g.lineTotal.toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${(() => {
    const netVal = bill.totalValue;
    const gstRate = bill.gstRate || 18;
    const gstAmount = showGst ? Math.round(netVal * gstRate / 100) : 0;
    const halfGst = Math.round(gstAmount / 2);
    const grandTotal = netVal + gstAmount;
    return `<div class="summary" style="flex-wrap:wrap;">
      <span>Qty: <strong>${bill.totalQuantity} units</strong></span>
      ${bill.totalDiscount > 0 ? `<span>Gross: <strong>₹${bill.grossValue.toLocaleString()}</strong></span><span>Discount: <strong style="color:#16a34a;">-₹${bill.totalDiscount.toLocaleString()}</strong></span>` : ''}
      <span>Subtotal: <strong>₹${netVal.toLocaleString()}</strong></span>
    </div>
    ${showGst ? `<div style="margin-top:8px;padding:10px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <table style="width:100%;font-size:13px;">
        <tr><td style="color:#6b7280;">CGST @ ${gstRate / 2}%</td><td style="text-align:right;font-weight:600;">₹${halfGst.toLocaleString()}</td></tr>
        <tr><td style="color:#6b7280;">SGST @ ${gstRate / 2}%</td><td style="text-align:right;font-weight:600;">₹${(gstAmount - halfGst).toLocaleString()}</td></tr>
        <tr style="border-top:2px solid ${color};"><td style="padding-top:6px;font-weight:700;font-size:15px;">Grand Total (incl. GST)</td><td style="text-align:right;font-weight:700;font-size:16px;color:${color};padding-top:6px;">₹${grandTotal.toLocaleString()}</td></tr>
      </table>
    </div>` : `<div style="margin-top:8px;text-align:right;font-size:16px;font-weight:700;color:${color};">Total: ₹${netVal.toLocaleString()}</div>`}`;
  })()}
  ${bankSection}
  ${tcSection}
  <div class="signatures">
    <div class="sig-box">
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:50px;margin-bottom:4px;" />` : ''}
      <p>${esc(billConfig.signatoryName || 'Authorized Signatory')}</p>
      ${billConfig.signatoryDesignation ? `<p style="font-size:10px;font-weight:400;margin-top:2px;">${esc(billConfig.signatoryDesignation)}</p>` : ''}
    </div>
    <div class="sig-box"><p>Received By</p></div>
  </div>
  <div class="footer">
    <p>This is a computer-generated challan. Products listed above have been dispatched as described.</p>
    <p style="margin-top:8px;font-size:9px;color:#c0c0c0;">${esc(footerText)}</p>
  </div>
</body></html>`;
}
