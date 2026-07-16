import type { SaleBillData, DistributionBillData } from '../api';

export function esc(text: unknown): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function safeColor(c: string | null | undefined): string {
  if (!c) return '#F27D26';
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#F27D26';
}

export function safeImgSrc(src: unknown): string {
  if (!src || typeof src !== 'string') return '';
  if (src.startsWith('data:image/')) return src;
  return '';
}

const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '32': 'Kerala', '33': 'Tamil Nadu',
  '36': 'Telangana', '37': 'Andhra Pradesh',
};

export function placeOfSupplyLabel(buyerGstin?: string | null, sellerGstin?: string | null): string {
  const code = String(buyerGstin || sellerGstin || '24').trim().toUpperCase().slice(0, 2);
  return `${STATE_NAMES[code] || 'Gujarat'} (${code || '24'})`;
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

export function generateSalesInvoiceHtml(bill: SaleBillData, options?: { showGst?: boolean; qrDataUrl?: string }): string {
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
  const footerText = (billConfig.footerText as string) || 'Powered by Dhandho Management';

  const warrantySection = (showWarranty && bill.warranty) ? `
    <div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <strong style="color:#166534;">Warranty Information</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">
        <tr><td style="color:#6b7280;">Duration</td><td><strong>${bill.warrantyMonths} months</strong></td>
            <td style="color:#6b7280;">Status</td><td><strong>${esc(bill.warranty.status)}</strong></td></tr>
        <tr><td style="color:#6b7280;">Activation</td><td>${fmtDate(bill.warranty.activationDate)}</td>
            <td style="color:#6b7280;">Expiry</td><td>${fmtDate(bill.warranty.expiryDate)}</td></tr>
      </table>
    </div>` : '';

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const upiQrSection = billConfig.bankUpiId ? (() => {
    const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
    const qrUrl = options?.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
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
  const sellerGstin = String((bill as unknown as Record<string, unknown>).companyGstin || billConfig.gstNumber || '');
  const buyerGstin = String((bill as unknown as Record<string, unknown>).customerGstin || '');
  const posLabel = placeOfSupplyLabel(buyerGstin, sellerGstin);

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
    return convert(Math.round(n)) + ' Rupees and ' + String(Math.round((n % 1) * 100) || '00').padStart(2, '0') + ' Paisa Only';
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Invoice'} - ${esc(invPrefix)}${esc(bill.id)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:20px;max-width:800px;margin:0 auto;font-size:12px;}
  table{border-collapse:collapse;}
  .outer{border:2px solid ${color};width:100%;}
  .outer td,.outer th{border:1px solid #ccc;padding:4px 8px;font-size:11px;}
  .hdr td{border:none;padding:8px 12px;vertical-align:top;}
  .title-row td{padding:6px 12px;font-size:12px;border-bottom:2px solid ${color};}
  .gstin-text{font-family:monospace;font-weight:700;font-size:13px;}
  .title-text{font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
  .cust-row td{padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;}
  .cust-label{font-weight:700;width:100px;color:#555;}
  .items th{background:#f0f0f0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:6px 6px;text-align:center;font-weight:700;}
  .items td{padding:5px 6px;text-align:center;}
  .items tr{page-break-inside:avoid;}
  .items .left{text-align:left;}
  .items .right{text-align:right;}
  .items .total-row{font-weight:700;background:#f0f0f0;}
  .summary-label{font-weight:700;color:#555;}
  .grand-total{font-size:16px;font-weight:900;color:${color};}
  .bank-section td{padding:3px 8px;font-size:11px;border:none;}
  .bank-label{font-weight:600;color:#555;width:90px;}
  .footer-text{font-size:9px;color:#999;text-align:center;margin-top:8px;}
  .reward-badge{display:inline-block;margin:8px auto;padding:6px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:20px;font-size:12px;font-weight:600;color:#92400e;}
  @media print{body{padding:10px;} @page{margin:8mm;} .no-print{display:none;}}
</style></head><body>
<table class="outer">
  <tr class="hdr" style="border-bottom:2px solid ${color};">
    <td colspan="2" style="width:65%;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoHtml}
        <div>
          <div style="font-size:20px;font-weight:700;color:${color};">${esc(bill.company.name)}</div>
          ${bill.company.address ? `<div style="font-size:10px;color:#555;">${esc(bill.company.address)}</div>` : ''}
          ${bill.company.phone ? `<div style="font-size:10px;color:#555;">Ph: ${esc(bill.company.phone)}</div>` : ''}
        </div>
      </div>
    </td>
    <td colspan="2" style="text-align:right;font-size:10px;color:#555;">
      ${tagline ? `<div>${esc(tagline)}</div>` : ''}
    </td>
  </tr>
  <tr class="title-row">
    <td colspan="1">${showGst && bill.company.gstNumber ? `<span class="gstin-text">GSTIN : ${esc(bill.company.gstNumber)}</span>` : '&nbsp;'}</td>
    <td colspan="2" style="text-align:center;"><span class="title-text">${showGst ? 'TAX INVOICE' : 'SALES INVOICE'}</span></td>
    <td colspan="1" style="text-align:right;font-size:10px;font-weight:600;">ORIGINAL FOR RECIPIENT</td>
  </tr>
  <tr>
    <td colspan="2" style="padding:0;border-right:2px solid ${color};">
      <table style="width:100%;">
        <tr class="cust-row"><td colspan="2" style="background:#f5f5f5;font-weight:700;font-size:10px;text-transform:uppercase;color:${color};">Customer Details</td></tr>
        <tr class="cust-row"><td class="cust-label">Name</td><td><strong>${esc(bill.customerName)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Phone</td><td>${esc(bill.customerPhone)}</td></tr>
        ${bill.customerEmail ? `<tr class="cust-row"><td class="cust-label">Email</td><td>${esc(bill.customerEmail)}</td></tr>` : ''}
        ${showGst ? `<tr class="cust-row"><td class="cust-label">Place of Supply</td><td>${esc(posLabel)}</td></tr>` : ''}
      </table>
    </td>
    <td colspan="2" style="padding:0;vertical-align:top;">
      <table style="width:100%;">
        <tr class="cust-row"><td class="cust-label">Invoice No.</td><td><strong style="font-family:monospace;">${esc(invPrefix)}${esc(bill.id)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Invoice Date</td><td><strong>${fmtDate(bill.purchaseDate)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Vendor</td><td>${esc(bill.vendor.name)}</td></tr>
      </table>
    </td>
  </tr>
</table>
<table class="outer items">
  <thead><tr>
    <th style="width:30px;">Sr.</th>
    ${showBarcode ? '<th>Barcode</th>' : ''}
    <th class="left">Name of Product / Service</th>
    ${showGst && bill.hsnCode ? '<th>HSN</th>' : ''}
    <th>Qty</th><th>Rate</th><th>Taxable</th>
    ${showGst ? '<th>%</th><th>Tax Amt</th>' : ''}
    <th>Total</th>
  </tr></thead>
  <tbody>
    <tr>
      <td>1</td>
      ${showBarcode ? `<td style="font-family:monospace;font-size:10px;">${esc(bill.barcode)}</td>` : ''}
      <td class="left"><strong>${esc(bill.productName)}</strong>${bill.productDescription ? `<br><span style="font-size:9px;color:#888;">${esc(bill.productDescription)}</span>` : ''}</td>
      ${showGst && bill.hsnCode ? `<td>${esc(bill.hsnCode)}</td>` : ''}
      <td>1</td>
      <td class="right">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="right">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${showGst ? `<td>${gstRate}.00</td><td class="right">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>` : ''}
      <td class="right" style="font-weight:700;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>
    <tr class="total-row"><td></td>${showBarcode ? '<td></td>' : ''}<td class="right"><strong>Total</strong></td>${showGst && bill.hsnCode ? '<td></td>' : ''}<td><strong>1</strong></td><td></td><td class="right"><strong>${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>${showGst ? `<td></td><td class="right"><strong>${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>` : ''}<td class="right" style="font-weight:900;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
  </tbody>
</table>
<table class="outer">
  <tr>
    <td style="width:55%;border-right:2px solid ${color};vertical-align:top;padding:8px;">
      <div class="summary-label">Total in words</div>
      <div style="text-transform:uppercase;font-size:10px;margin-top:2px;">${numberToWords(grandTotal)}</div>
    </td>
    <td style="padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label" style="padding:3px 8px;">Taxable Amount</td><td class="right" style="padding:3px 8px;">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        ${showGst ? `<tr><td style="padding:3px 8px;">Add : CGST</td><td class="right" style="padding:3px 8px;">${halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:3px 8px;">Add : SGST</td><td class="right" style="padding:3px 8px;">${(gstAmount - halfGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
        <tr><td style="padding:3px 8px;">Total Tax</td><td class="right" style="padding:3px 8px;">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:700;">Total Amount After Tax</td><td class="right grand-total" style="padding:4px 8px;">₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      </table>
    </td>
  </tr>
  <tr><td colspan="2" style="text-align:right;padding:2px 8px;font-size:10px;color:#666;">(E & O.E.)</td></tr>
</table>
${warrantySection}
${showRewards && bill.rewardPointsEarned > 0 ? `<div style="text-align:center;"><span class="reward-badge">+${bill.rewardPointsEarned} Reward Points Earned</span></div>` : ''}
<table class="outer" style="margin-top:-1px;">
  <tr>
    <td style="width:55%;padding:8px 12px;border-right:2px solid ${color};vertical-align:top;">
      ${hasBankDetails ? `<div style="font-weight:700;font-size:11px;margin-bottom:6px;">Bank Details</div>
      <table class="bank-section">
        ${billConfig.bankAccountName ? `<tr><td class="bank-label">Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td class="bank-label">Branch</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? ', ' + esc(billConfig.bankBranch) : ''}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td class="bank-label">Acc. Number</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td class="bank-label">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td class="bank-label">UPI ID</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>` : ''}
      ${upiQrSection ? `<div style="margin-top:6px;">${upiQrSection}<div style="font-size:9px;color:#666;text-align:center;">Pay using UPI</div></div>` : ''}
    </td>
    <td style="vertical-align:top;padding:8px 12px;">
      <div style="font-size:9px;color:#666;margin-bottom:4px;">Certified that the particulars given above are true and correct.</div>
      <div style="font-weight:700;font-size:12px;margin-bottom:30px;">For ${esc(bill.company.name)}</div>
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:40px;margin-bottom:4px;" />` : ''}
      <div style="border-top:1px solid #333;padding-top:4px;font-size:10px;font-weight:600;color:#555;">Authorised Signatory</div>
    </td>
  </tr>
</table>
${tcSection ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:6px 12px;font-size:10px;">
  <div style="font-weight:700;margin-bottom:4px;">Terms and Conditions</div>
  <div style="color:#555;white-space:pre-line;">${esc(billConfig.termsAndConditions)}</div>
</td></tr></table>` : ''}
<div class="footer-text">${esc(footerText)}</div>
</body></html>`;
}

export function generateDistributionChallanHtml(bill: DistributionBillData, options?: {
  showGst?: boolean;
  fullyPaid?: boolean;
  qrDataUrl?: string;
  irnQrDataUrl?: string;
}): string {
  const showGst = options?.showGst ?? true;
  const fullyPaid = options?.fullyPaid ?? false;
  const billConfig = (bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined ?? {};
  const color = safeColor(billConfig.primaryColor as string);
  const logoHtml = billConfig.logoBase64
    ? `<img src="${safeImgSrc(billConfig.logoBase64)}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div class="logo-icon">${(bill.company.name || 'C').substring(0, 1).toUpperCase()}</div>`;
  const tagline = (billConfig.tagline as string) || '';
  const chPrefix = (billConfig.challanPrefix as string) || '';
  const footerText = (billConfig.footerText as string) || 'Powered by Dhandho Management';
  const ewbNumber = bill.ewbNumber || '';
  const irn = bill.irn || '';
  const irnAckNo = bill.irnAckNo || '';
  const irnAckDt = bill.irnAckDt || '';
  const irnQrPayload = bill.irnQr || '';
  const irnQrSrc = options?.irnQrDataUrl
    || (irnQrPayload ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(irnQrPayload)}` : '');

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const upiQrSection = billConfig.bankUpiId ? (() => {
    const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
    const qrUrl = options?.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
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
  // Prefer stored billed totals when available (matches books); else exclusive calc on net
  const billedFromItems = bill.groupedItems?.reduce((s, g) => {
    const line = Number((g as Record<string, unknown>).billedLineTotal ?? g.lineTotal) || 0;
    return s + line;
  }, 0) ?? 0;
  const gstAmount = showGst
    ? (billedFromItems > netVal ? Math.round(billedFromItems - netVal) : Math.round(netVal * gstRate / 100))
    : 0;
  const halfGst = Math.round(gstAmount / 2);
  const grandTotal = netVal + gstAmount;
  const vendorGstin = (bill.vendor as Record<string, unknown>).gstNumber as string || '';
  const sellerGstin = String(billConfig.gstNumber || (bill as unknown as Record<string, unknown>).companyGstin || '');
  const posLabel = placeOfSupplyLabel(vendorGstin, sellerGstin);

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
    return convert(Math.round(n)) + ' Rupees and ' + String(Math.round((n % 1) * 100) || '00').padStart(2, '0') + ' Paisa Only';
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Challan'} - ${esc(chPrefix)}${esc(bill.challanId)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:20px;max-width:800px;margin:0 auto;font-size:12px;}
  table{border-collapse:collapse;}
  .outer{border:2px solid ${color};width:100%;}
  .outer td,.outer th{border:1px solid #ccc;padding:4px 8px;font-size:11px;}
  .hdr{border-bottom:2px solid ${color};}
  .hdr td{border:none;padding:8px 12px;vertical-align:top;}
  .tagline{background:${color};color:white;text-align:center;padding:4px;font-size:11px;font-weight:600;letter-spacing:1px;}
  .title-row td{padding:6px 12px;font-size:12px;border-bottom:2px solid ${color};}
  .gstin-text{font-family:monospace;font-weight:700;font-size:13px;}
  .title-text{font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
  .cust-row td{padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;}
  .cust-label{font-weight:700;width:100px;color:#555;}
  .items th{background:#f0f0f0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:6px 6px;text-align:center;font-weight:700;}
  .items td{padding:5px 6px;text-align:center;}
  .items tr{page-break-inside:avoid;}
  .items .left{text-align:left;}
  .items .right{text-align:right;}
  .items .total-row{font-weight:700;background:#f0f0f0;}
  .summary-row td{padding:4px 8px;font-size:11px;vertical-align:top;}
  .summary-label{font-weight:700;color:#555;}
  .grand-total{font-size:16px;font-weight:900;color:${color};}
  .bank-section td{padding:3px 8px;font-size:11px;border:none;}
  .bank-label{font-weight:600;color:#555;width:90px;}
  .sig-section{margin-top:0;}
  .sig-section td{border:none;padding:6px 12px;vertical-align:bottom;height:60px;}
  .footer-text{font-size:9px;color:#999;text-align:center;margin-top:8px;}
  .paid-stamp{position:absolute;top:80px;right:40px;padding:8px 14px;border:3px solid #059669;color:#059669;background:#ecfdf5;border-radius:8px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;transform:rotate(-12deg);}
  @media print{body{padding:10px;} @page{margin:8mm;} .no-print{display:none;}}
</style></head><body>
<div style="position:relative;">
${fullyPaid ? '<div class="paid-stamp">✓ PAID</div>' : ''}
<table class="outer">
  <!-- Header Row: Logo+Company Left, Info Right -->
  <tr class="hdr">
    <td colspan="2" style="width:65%;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoHtml}
        <div>
          <div style="font-size:20px;font-weight:700;color:${color};">${esc(bill.company.name)}</div>
          ${bill.company.address ? `<div style="font-size:10px;color:#555;">${esc(bill.company.address)}</div>` : ''}
          ${bill.company.phone ? `<div style="font-size:10px;color:#555;">Ph: ${esc(bill.company.phone)}</div>` : ''}
        </div>
      </div>
    </td>
    <td colspan="2" style="text-align:right;font-size:10px;color:#555;">
      ${tagline ? `<div style="font-size:10px;color:#666;">${esc(tagline)}</div>` : ''}
    </td>
  </tr>

  <!-- Tagline Bar (if exists) -->
  ${tagline ? '' : ''}

  <!-- GSTIN + TAX INVOICE + ORIGINAL -->
  <tr class="title-row">
    <td colspan="1" style="width:35%;">
      ${showGst && bill.company.gstNumber ? `<span class="gstin-text">GSTIN : ${esc(bill.company.gstNumber)}</span>` : '&nbsp;'}
    </td>
    <td colspan="2" style="text-align:center;">
      <span class="title-text">${showGst ? 'TAX INVOICE' : 'CHALLAN'}</span>
    </td>
    <td colspan="1" style="text-align:right;font-size:10px;font-weight:600;">
      ORIGINAL FOR RECIPIENT
    </td>
  </tr>

  <!-- Customer Detail + Invoice Info -->
  <tr>
    <td colspan="2" style="padding:0;border-right:2px solid ${color};">
      <table style="width:100%;">
        <tr class="cust-row"><td colspan="2" style="background:#f5f5f5;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${color};">Buyer Details</td></tr>
        <tr class="cust-row"><td class="cust-label">Name</td><td><strong>${esc(bill.vendor.name)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Address</td><td>${esc(bill.vendor.address || '-')}</td></tr>
        <tr class="cust-row"><td class="cust-label">Phone</td><td>${esc(bill.vendor.phone || '-')}</td></tr>
        ${showGst ? `<tr class="cust-row"><td class="cust-label">GSTIN</td><td class="gstin-text">${esc(vendorGstin || '-')}</td></tr>` : ''}
        ${showGst ? `<tr class="cust-row"><td class="cust-label">Place of Supply</td><td>${esc(posLabel)}</td></tr>` : ''}
      </table>
    </td>
    <td colspan="2" style="padding:0;vertical-align:top;">
      <table style="width:100%;">
        <tr class="cust-row"><td class="cust-label">Invoice No.</td><td><strong style="font-family:monospace;">${esc(chPrefix)}${esc(bill.challanId)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Invoice Date</td><td><strong>${fmtDate(bill.distributionDate)}</strong></td></tr>
        ${ewbNumber ? `<tr class="cust-row"><td class="cust-label">E-Way Bill</td><td><strong style="font-family:monospace;">${esc(ewbNumber)}</strong></td></tr>` : ''}
        ${irn ? `<tr class="cust-row"><td class="cust-label">IRN</td><td style="font-family:monospace;font-size:9px;word-break:break-all;">${esc(irn)}</td></tr>` : ''}
        ${irnAckNo ? `<tr class="cust-row"><td class="cust-label">Ack No.</td><td><strong style="font-family:monospace;">${esc(irnAckNo)}</strong></td></tr>` : ''}
        ${irnAckDt ? `<tr class="cust-row"><td class="cust-label">Ack Date</td><td>${esc(irnAckDt)}</td></tr>` : ''}
      </table>
      ${irnQrSrc ? `<div style="padding:8px;text-align:center;border-top:1px solid #eee;">
        <img src="${irnQrSrc}" style="width:120px;height:120px;" alt="E-Invoice QR" />
        <div style="font-size:9px;color:#666;margin-top:2px;font-weight:600;">e-Invoice QR</div>
      </div>` : ''}
    </td>
  </tr>
</table>

<!-- Item Table -->
<table class="outer items">
  <thead><tr>
    <th style="width:30px;">Sr.<br>No.</th>
    <th class="left">Name of Product / Service</th>
    ${showGst ? '<th>HSN / SAC</th>' : ''}
    <th>Qty</th>
    <th>Rate</th>
    <th>Taxable Value</th>
    ${showGst ? `<th colspan="2">${vendorGstin ? 'CGST' : 'IGST'}</th>` : ''}
    <th>Total</th>
  </tr>
  ${showGst ? `<tr>
    <th></th><th></th>${showGst ? '<th></th>' : ''}<th></th><th></th><th></th>
    <th>%</th><th>Amount</th><th></th>
  </tr>` : ''}</thead>
  <tbody>
  ${bill.groupedItems.map((g) => {
    const lineGst = showGst ? Math.round(g.lineTotal * gstRate / 100) : 0;
    return `<tr>
      <td>${g.sno}</td>
      <td class="left"><strong>${esc(g.productName)}</strong>${(g as Record<string, unknown>).packQuantity ? ` <span style="font-size:9px;color:#666;">${esc((g as Record<string, unknown>).packQuantity)}</span>` : ''}</td>
      ${showGst ? `<td>${esc((g as Record<string, unknown>).hsnCode as string || '-')}</td>` : ''}
      <td>${g.quantity}</td>
      <td class="right">${g.netPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="right">${g.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${showGst ? `<td>${gstRate}.00</td><td class="right">${lineGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>` : ''}
      <td class="right" style="font-weight:700;">${(g.lineTotal + lineGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('')}
  <tr class="total-row">
    <td></td><td class="right"><strong>Total</strong></td>
    ${showGst ? '<td></td>' : ''}
    <td><strong>${bill.totalQuantity}</strong></td>
    <td></td>
    <td class="right"><strong>${netVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
    ${showGst ? `<td></td><td class="right"><strong>${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>` : ''}
    <td class="right" style="font-weight:900;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
  </tr>
  </tbody>
</table>

<!-- Summary: Total in Words + Tax Breakdown -->
<table class="outer">
  <tr class="summary-row">
    <td style="width:55%;border-right:2px solid ${color};">
      <div class="summary-label">Total in words</div>
      <div style="text-transform:uppercase;font-size:10px;margin-top:2px;">${numberToWords(grandTotal)}</div>
    </td>
    <td style="padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label" style="padding:3px 8px;">Taxable Amount</td><td class="right" style="padding:3px 8px;">${netVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        ${showGst ? (vendorGstin
          ? `<tr><td style="padding:3px 8px;">Add : CGST</td><td class="right" style="padding:3px 8px;">${halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
             <tr><td style="padding:3px 8px;">Add : SGST</td><td class="right" style="padding:3px 8px;">${(gstAmount - halfGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
          : `<tr><td style="padding:3px 8px;">Add : IGST</td><td class="right" style="padding:3px 8px;">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
        ) : ''}
        <tr><td style="padding:3px 8px;">Total Tax</td><td class="right" style="padding:3px 8px;">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:700;">Total Amount After Tax</td><td class="right grand-total" style="padding:4px 8px;">₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      </table>
    </td>
  </tr>
  <tr><td colspan="2" style="text-align:right;padding:2px 8px;font-size:10px;color:#666;">(E & O.E.)</td></tr>
</table>

<!-- Bank Details + Signature -->
<table class="outer" style="margin-top:-1px;">
  <tr>
    <td style="width:55%;padding:8px 12px;border-right:2px solid ${color};vertical-align:top;">
      ${hasBankDetails ? `<div style="font-weight:700;font-size:11px;margin-bottom:6px;">Bank Details</div>
      <table class="bank-section">
        ${billConfig.bankAccountName ? `<tr><td class="bank-label">Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td class="bank-label">Branch</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? ', ' + esc(billConfig.bankBranch) : ''}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td class="bank-label">Acc. Number</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td class="bank-label">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td class="bank-label">UPI ID</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>` : ''}
      ${upiQrSection ? `<div style="margin-top:6px;">${upiQrSection}<div style="font-size:9px;color:#666;text-align:center;">Pay using UPI</div></div>` : ''}
    </td>
    <td style="vertical-align:top;padding:8px 12px;">
      <div style="font-size:9px;color:#666;margin-bottom:4px;">Certified that the particulars given above are true and correct.</div>
      <div style="font-weight:700;font-size:12px;margin-bottom:30px;">For ${esc(bill.company.name)}</div>
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:40px;margin-bottom:4px;" />` : ''}
      <div style="border-top:1px solid #333;padding-top:4px;font-size:10px;font-weight:600;color:#555;">Authorised Signatory</div>
    </td>
  </tr>
</table>

${tcSection ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:6px 12px;font-size:10px;">
  <div style="font-weight:700;margin-bottom:4px;">Terms and Conditions</div>
  <div style="color:#555;white-space:pre-line;">${esc(billConfig.termsAndConditions)}</div>
</td></tr></table>` : ''}

<div class="footer-text">${esc(footerText)}</div>
</div>
</body></html>`;
}
