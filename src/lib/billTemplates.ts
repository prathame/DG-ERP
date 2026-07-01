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
  const upiQrSection = billConfig.bankUpiId ? (() => {
    const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
    return `<div style="text-align:center;">
      <img src="${qrUrl}" style="width:120px;height:120px;" />
      <p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p>
    </div>`;
  })() : '';
  const bankSection = hasBankDetails || upiQrSection ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        ${hasBankDetails ? `<div style="flex:1;">
          <strong style="font-size:13px;">Bank Details</strong>
          <table style="width:100%;margin-top:8px;font-size:12px;">
            ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
            ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
            ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
            ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
            ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
          </table>
        </div>` : ''}
        ${upiQrSection}
      </div>
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

  const gstRate = bill.gstRate || 18;
  const basePrice = Number(bill.salePrice);
  const gstAmount = showGst ? Math.round(basePrice * gstRate / 100) : 0;
  const halfGst = Math.round(gstAmount / 2);
  const grandTotal = basePrice + gstAmount;

  const numberToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const convert = (num: number): string => {
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    return convert(Math.round(n)) + ' Rupees Only';
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Invoice'} - ${invPrefix}${bill.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:24px;max-width:800px;margin:0 auto;font-size:12px;}
  .border-box{border:1px solid #333;margin-bottom:-1px;}
  .header-row{display:flex;border-bottom:1px solid #333;}
  .header-left{flex:1;padding:12px;border-right:1px solid #333;}
  .header-right{width:220px;padding:12px;}
  .title-bar{background:${color};color:white;text-align:center;padding:6px;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
  .party-row{display:flex;border-bottom:1px solid #333;}
  .party-box{flex:1;padding:10px;}
  .party-box:first-child{border-right:1px solid #333;}
  .party-box h4{font-size:10px;text-transform:uppercase;color:#666;margin-bottom:4px;letter-spacing:0.5px;}
  .party-box p{margin:1px 0;font-size:11px;}
  .gstin{font-family:monospace;font-weight:700;font-size:12px;color:${color};}
  table.items{width:100%;border-collapse:collapse;}
  table.items th{background:#f3f4f6;padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #333;font-weight:700;}
  table.items td{padding:5px 8px;border:1px solid #ddd;font-size:11px;}
  table.items tr{page-break-inside:avoid;}
  .tax-summary{display:flex;border-top:1px solid #333;}
  .tax-left{flex:1;padding:10px;border-right:1px solid #333;font-size:11px;}
  .tax-right{width:280px;padding:0;}
  .tax-right table{width:100%;border-collapse:collapse;}
  .tax-right td{padding:4px 10px;font-size:11px;border-bottom:1px solid #eee;}
  .tax-right .grand{background:${color};color:white;font-weight:700;font-size:13px;border:none;}
  .sig-row{display:flex;margin-top:40px;border-top:1px solid #333;}
  .sig-box{flex:1;padding:8px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;}
  .sig-box:first-child{border-right:1px solid #333;}
  .sig-box p{font-size:10px;font-weight:600;color:#666;text-transform:uppercase;}
  .footer{margin-top:12px;font-size:9px;color:#999;text-align:center;}
  .reward-badge{display:inline-block;margin:12px auto;padding:6px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:20px;font-size:12px;font-weight:600;color:#92400e;}
  @media print{body{padding:10px;margin:0;} .no-print{display:none;} @page{margin:10mm;}}
</style></head><body>
  <div class="border-box">
    <!-- Header -->
    <div class="header-row">
      <div class="header-left">
        <div style="display:flex;align-items:center;gap:10px;">
          ${logoHtml}
          <div>
            <div style="font-size:18px;font-weight:700;">${esc(bill.company.name)}</div>
            ${tagline ? `<div style="font-size:10px;color:#666;">${esc(tagline)}</div>` : ''}
          </div>
        </div>
        ${bill.company.address ? `<p style="margin-top:6px;">${esc(bill.company.address)}</p>` : ''}
        ${bill.company.phone ? `<p>Phone: ${esc(bill.company.phone)}</p>` : ''}
        ${showGst && bill.company.gstNumber ? `<p class="gstin">GSTIN: ${esc(bill.company.gstNumber)}</p>` : ''}
      </div>
      <div class="header-right">
        <p><strong>Invoice No:</strong></p>
        <p style="font-family:monospace;font-size:13px;">${invPrefix}${bill.id}</p>
        <p style="margin-top:8px;"><strong>Date:</strong></p>
        <p>${fmtDate(bill.purchaseDate)}</p>
        ${showGst ? `<p style="margin-top:8px;"><strong>Place of Supply:</strong></p><p>Gujarat (24)</p>` : ''}
      </div>
    </div>

    <!-- Title -->
    <div class="title-bar">${showGst ? 'TAX INVOICE' : 'SALES INVOICE'}</div>

    <!-- Seller / Buyer -->
    <div class="party-row">
      <div class="party-box">
        <h4>Sold By (Seller)</h4>
        <p><strong>${esc(bill.vendor.name)}</strong></p>
        ${bill.vendor.contactPerson ? `<p>${esc(bill.vendor.contactPerson)}</p>` : ''}
        ${bill.vendor.address ? `<p>${esc(bill.vendor.address)}</p>` : ''}
        ${bill.vendor.phone ? `<p>Ph: ${esc(bill.vendor.phone)}</p>` : ''}
      </div>
      <div class="party-box">
        <h4>Bill To (Customer)</h4>
        <p><strong>${esc(bill.customerName)}</strong></p>
        <p>Ph: ${esc(bill.customerPhone)}</p>
        ${bill.customerEmail ? `<p>${esc(bill.customerEmail)}</p>` : ''}
      </div>
    </div>

    <!-- Item Table -->
    <table class="items">
      <thead><tr>
        <th style="width:30px;">S.No</th>
        ${showBarcode ? '<th>Barcode</th>' : ''}
        <th style="text-align:left;">Description</th>
        ${showGst && bill.hsnCode ? '<th>HSN</th>' : ''}
        <th>Qty</th>
        <th>Rate</th>
        <th>Taxable</th>
        ${showGst ? `<th>CGST<br>${gstRate/2}%</th><th>SGST<br>${gstRate/2}%</th>` : ''}
        <th>Total</th>
      </tr></thead>
      <tbody>
        <tr>
          <td style="text-align:center;">1</td>
          ${showBarcode ? `<td style="font-family:monospace;font-size:10px;">${esc(bill.barcode)}</td>` : ''}
          <td style="text-align:left;"><strong>${esc(bill.productName)}</strong>${bill.productDescription ? `<br><span style="font-size:9px;color:#888;">${esc(bill.productDescription)}</span>` : ''}</td>
          ${showGst && bill.hsnCode ? `<td style="text-align:center;font-size:10px;">${esc(bill.hsnCode)}</td>` : ''}
          <td style="text-align:center;">1</td>
          <td style="text-align:right;">₹${basePrice.toLocaleString()}</td>
          <td style="text-align:right;">₹${basePrice.toLocaleString()}</td>
          ${showGst ? `<td style="text-align:right;">₹${halfGst.toLocaleString()}</td><td style="text-align:right;">₹${(gstAmount - halfGst).toLocaleString()}</td>` : ''}
          <td style="text-align:right;font-weight:700;">₹${grandTotal.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>

    <!-- Tax Summary + Total -->
    <div class="tax-summary">
      <div class="tax-left">
        <p><strong>Total in Words:</strong></p>
        <p style="font-style:italic;">${numberToWords(grandTotal)}</p>
      </div>
      <div class="tax-right">
        <table>
          <tr><td>Subtotal</td><td style="text-align:right;font-weight:600;">₹${basePrice.toLocaleString()}</td></tr>
          ${showGst ? `<tr><td>CGST @ ${gstRate/2}%</td><td style="text-align:right;">₹${halfGst.toLocaleString()}</td></tr>
          <tr><td>SGST @ ${gstRate/2}%</td><td style="text-align:right;">₹${(gstAmount - halfGst).toLocaleString()}</td></tr>` : ''}
          <tr class="grand"><td>Grand Total</td><td style="text-align:right;">₹${grandTotal.toLocaleString()}</td></tr>
        </table>
      </div>
    </div>
  </div>

  ${warrantySection}
  ${showRewards && bill.rewardPointsEarned > 0 ? `<div style="text-align:center;"><span class="reward-badge">+${bill.rewardPointsEarned} Reward Points Earned</span></div>` : ''}
  ${bankSection}
  ${tcSection}

  <div class="sig-row">
    <div class="sig-box">
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:40px;margin-bottom:4px;" />` : ''}
      <p>For ${esc(bill.company.name)}</p>
      <p style="font-size:9px;font-weight:400;">${esc(billConfig.signatoryName || 'Authorized Signatory')}</p>
    </div>
    <div class="sig-box"><p>Customer Signature</p></div>
  </div>
  <div class="footer">
    <p>This is a computer-generated invoice and does not require a physical signature.</p>
    <p style="margin-top:4px;">${esc(footerText)}</p>
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
  const upiQrSection = billConfig.bankUpiId ? (() => {
    const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
    return `<div style="text-align:center;">
      <img src="${qrUrl}" style="width:120px;height:120px;" />
      <p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p>
    </div>`;
  })() : '';
  const bankSection = hasBankDetails || upiQrSection ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        ${hasBankDetails ? `<div style="flex:1;">
          <strong style="font-size:13px;">Bank Details</strong>
          <table style="width:100%;margin-top:8px;font-size:12px;">
            ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
            ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
            ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
            ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
            ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
          </table>
        </div>` : ''}
        ${upiQrSection}
      </div>
    </div>` : '';

  const tcSection = billConfig.termsAndConditions ? `
    <div style="margin-top:16px;font-size:11px;">
      <strong>Terms & Conditions:</strong>
      <p style="white-space:pre-line;color:#6b7280;margin-top:4px;">${esc(billConfig.termsAndConditions)}</p>
    </div>` : '';

  const gstRate = bill.gstRate || 18;
  const netVal = bill.totalValue;
  const gstAmount = showGst ? Math.round(netVal * gstRate / 100) : 0;
  const halfGst = Math.round(gstAmount / 2);
  const grandTotal = netVal + gstAmount;
  const vendorGstin = (bill.vendor as Record<string, unknown>).gstNumber as string || '';
  const hasDiscount = bill.groupedItems.some(g => g.discountPercent > 0);

  const numberToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const convert = (num: number): string => {
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    return convert(Math.round(n)) + ' Rupees Only';
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Challan'} - ${chPrefix}${bill.challanId}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:24px;max-width:800px;margin:0 auto;font-size:12px;}
  .border-box{border:1px solid #333;margin-bottom:-1px;}
  .header-row{display:flex;border-bottom:1px solid #333;}
  .header-left{flex:1;padding:12px;border-right:1px solid #333;}
  .header-right{width:220px;padding:12px;}
  .title-bar{background:${color};color:white;text-align:center;padding:6px;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
  .party-row{display:flex;border-bottom:1px solid #333;}
  .party-box{flex:1;padding:10px;}
  .party-box:first-child{border-right:1px solid #333;}
  .party-box h4{font-size:10px;text-transform:uppercase;color:#666;margin-bottom:4px;letter-spacing:0.5px;}
  .party-box p{margin:1px 0;font-size:11px;}
  .gstin{font-family:monospace;font-weight:700;font-size:12px;color:${color};}
  table.items{width:100%;border-collapse:collapse;}
  table.items th{background:#f3f4f6;padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border:1px solid #333;font-weight:700;}
  table.items td{padding:5px 8px;border:1px solid #ddd;font-size:11px;}
  table.items tr{page-break-inside:avoid;}
  table.items tbody tr:nth-child(even){background:#fafafa;}
  .tax-summary{display:flex;border-top:1px solid #333;}
  .tax-left{flex:1;padding:10px;border-right:1px solid #333;font-size:11px;}
  .tax-right{width:280px;padding:0;}
  .tax-right table{width:100%;border-collapse:collapse;}
  .tax-right td{padding:4px 10px;font-size:11px;border-bottom:1px solid #eee;}
  .tax-right .grand{background:${color};color:white;font-weight:700;font-size:13px;border:none;}
  .sig-row{display:flex;margin-top:40px;border-top:1px solid #333;}
  .sig-box{flex:1;padding:8px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;}
  .sig-box:first-child{border-right:1px solid #333;}
  .sig-box p{font-size:10px;font-weight:600;color:#666;text-transform:uppercase;}
  .footer{margin-top:12px;font-size:9px;color:#999;text-align:center;}
  .paid-stamp{position:absolute;top:60px;right:30px;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:3px solid #059669;color:#059669;background:#ecfdf5;border-radius:8px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;transform:rotate(-12deg);}
  @media print{body{padding:10px;margin:0;} .no-print{display:none;} @page{margin:10mm;}}
</style></head><body>
  <div style="position:relative;">
  ${fullyPaid ? '<div class="paid-stamp">✓ PAID</div>' : ''}
  <div class="border-box">
    <!-- Header -->
    <div class="header-row">
      <div class="header-left">
        <div style="display:flex;align-items:center;gap:10px;">
          ${logoHtml}
          <div>
            <div style="font-size:18px;font-weight:700;">${esc(bill.company.name)}</div>
            ${tagline ? `<div style="font-size:10px;color:#666;">${esc(tagline)}</div>` : ''}
          </div>
        </div>
        ${bill.company.address ? `<p style="margin-top:6px;">${esc(bill.company.address)}</p>` : ''}
        ${bill.company.phone ? `<p>Phone: ${esc(bill.company.phone)}</p>` : ''}
        ${showGst && bill.company.gstNumber ? `<p class="gstin">GSTIN: ${esc(bill.company.gstNumber)}</p>` : ''}
      </div>
      <div class="header-right">
        <p><strong>Invoice No:</strong></p>
        <p style="font-family:monospace;font-size:13px;">${chPrefix}${bill.challanId}</p>
        <p style="margin-top:8px;"><strong>Date:</strong></p>
        <p>${fmtDate(bill.distributionDate)}</p>
        ${showGst ? `<p style="margin-top:8px;"><strong>Place of Supply:</strong></p><p>Gujarat (24)</p>` : ''}
      </div>
    </div>

    <!-- Title -->
    <div class="title-bar">${showGst ? 'TAX INVOICE' : 'DISTRIBUTION CHALLAN'}</div>

    <!-- Seller / Buyer -->
    <div class="party-row">
      <div class="party-box">
        <h4>Bill From (Seller)</h4>
        <p><strong>${esc(bill.company.name)}</strong></p>
        ${bill.company.contactName ? `<p>${esc(bill.company.contactName)}</p>` : ''}
        ${bill.company.address ? `<p>${esc(bill.company.address)}</p>` : ''}
        ${bill.company.phone ? `<p>Ph: ${esc(bill.company.phone)}</p>` : ''}
        ${showGst && bill.company.gstNumber ? `<p class="gstin">GSTIN: ${esc(bill.company.gstNumber)}</p>` : ''}
      </div>
      <div class="party-box">
        <h4>Bill To (Buyer)</h4>
        <p><strong>${esc(bill.vendor.name)}</strong></p>
        ${bill.vendor.contactPerson ? `<p>${esc(bill.vendor.contactPerson)}</p>` : ''}
        ${bill.vendor.address ? `<p>${esc(bill.vendor.address)}</p>` : ''}
        ${bill.vendor.phone ? `<p>Ph: ${esc(bill.vendor.phone)}</p>` : ''}
        ${showGst && vendorGstin ? `<p class="gstin">GSTIN: ${esc(vendorGstin)}</p>` : ''}
      </div>
    </div>

    <!-- Item Table -->
    <table class="items">
      <thead><tr>
        <th style="width:30px;">S.No</th>
        <th style="text-align:left;">Description</th>
        ${showGst ? '<th>HSN</th>' : ''}
        <th>Qty</th>
        ${hasDiscount ? '<th>MRP</th><th>Disc%</th>' : ''}
        <th>Rate</th>
        <th>Taxable Amt</th>
        ${showGst ? `<th>CGST<br>${gstRate/2}%</th><th>SGST<br>${gstRate/2}%</th>` : ''}
        <th>Total</th>
      </tr></thead>
      <tbody>${bill.groupedItems.map((g) => {
        const lineGst = showGst ? Math.round(g.lineTotal * gstRate / 100) : 0;
        const lineCgst = Math.round(lineGst / 2);
        const lineSgst = lineGst - lineCgst;
        return `<tr>
          <td style="text-align:center;">${g.sno}</td>
          <td style="text-align:left;"><strong>${esc(g.productName)}</strong><br><span style="font-size:9px;color:#888;font-family:monospace;">${esc(g.barcodeRange)}</span>${(g as Record<string, unknown>).packQuantity ? `<br><span style="font-size:9px;color:#666;">${(g as Record<string, unknown>).packQuantity}</span>` : ''}</td>
          ${showGst ? `<td style="text-align:center;font-size:10px;">${esc((g as Record<string, unknown>).hsnCode as string || '-')}</td>` : ''}
          <td style="text-align:center;">${g.quantity}</td>
          ${hasDiscount ? `<td style="text-align:right;">₹${g.originalPrice.toLocaleString()}</td><td style="text-align:center;">${g.discountPercent > 0 ? g.discountPercent + '%' : '-'}</td>` : ''}
          <td style="text-align:right;">₹${g.netPrice.toLocaleString()}</td>
          <td style="text-align:right;">₹${g.lineTotal.toLocaleString()}</td>
          ${showGst ? `<td style="text-align:right;">₹${lineCgst.toLocaleString()}</td><td style="text-align:right;">₹${lineSgst.toLocaleString()}</td>` : ''}
          <td style="text-align:right;font-weight:700;">₹${(g.lineTotal + lineGst).toLocaleString()}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>

    <!-- Tax Summary + Total -->
    <div class="tax-summary">
      <div class="tax-left">
        <p><strong>Total in Words:</strong></p>
        <p style="font-style:italic;">${numberToWords(grandTotal)}</p>
        ${bill.totalDiscount > 0 ? `<p style="margin-top:4px;">Gross: ₹${bill.grossValue.toLocaleString()} | Discount: -₹${bill.totalDiscount.toLocaleString()}</p>` : ''}
      </div>
      <div class="tax-right">
        <table>
          <tr><td>Subtotal</td><td style="text-align:right;font-weight:600;">₹${netVal.toLocaleString()}</td></tr>
          ${showGst ? `<tr><td>CGST @ ${gstRate/2}%</td><td style="text-align:right;">₹${halfGst.toLocaleString()}</td></tr>
          <tr><td>SGST @ ${gstRate/2}%</td><td style="text-align:right;">₹${(gstAmount - halfGst).toLocaleString()}</td></tr>` : ''}
          <tr class="grand"><td>Grand Total</td><td style="text-align:right;">₹${grandTotal.toLocaleString()}</td></tr>
        </table>
      </div>
    </div>
  </div>

  ${bankSection}
  ${tcSection}

  <div class="sig-row">
    <div class="sig-box">
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:40px;margin-bottom:4px;" />` : ''}
      <p>For ${esc(bill.company.name)}</p>
      <p style="font-size:9px;font-weight:400;">${esc(billConfig.signatoryName || 'Authorized Signatory')}</p>
    </div>
    <div class="sig-box"><p>Receiver's Signature</p></div>
  </div>
  <div class="footer">
    <p>This is a computer-generated invoice and does not require a physical signature.</p>
    <p style="margin-top:4px;">${esc(footerText)}</p>
  </div>
  </div>
</body></html>`;
}
