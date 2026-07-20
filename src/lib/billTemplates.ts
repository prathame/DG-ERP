import type { SaleBillData, DistributionBillData } from '../api';

export function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/** Shared print/PDF CSS — full A4 width, boxed sections (Vyapar-style), no zebra fills. */
function billDocCss(color: string): string {
  return `
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:100%;background:#fff;color:#111;}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:8mm;margin:0;font-size:11px;}
  table{border-collapse:collapse;width:100%;}
  .outer{border:1px solid #222;width:100%;}
  .outer td,.outer th{border:1px solid #ccc;padding:4px 8px;font-size:11px;}
  .doc-title{text-align:center;font-size:18px;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;margin:0 0 10px;color:#111;}
  .title-box td{text-align:center;font-size:16px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;padding:6px 8px;border:1px solid #222;}
  .hdr td{border:none;padding:8px 12px;vertical-align:top;}
  .hdr{border-bottom:1.5px solid #222;}
  .tagline{border:1px solid ${color};color:${color};background:transparent;text-align:center;padding:4px;font-size:11px;font-weight:600;}
  .title-row td{padding:6px 12px;font-size:12px;border-bottom:1.5px solid #222;}
  .gstin-text{font-family:monospace;font-weight:700;font-size:12px;}
  .title-text{font-size:15px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;}
  .cust-row td{padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;background:transparent!important;}
  .cust-label{font-weight:700;width:100px;color:#555;}
  .section-head{font-weight:700;font-size:10px;text-transform:uppercase;color:${color};border-bottom:1px solid #222;background:transparent!important;}
  .items th{background:transparent!important;border:1px solid #222;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;padding:6px;text-align:center;font-weight:700;}
  .items td{padding:5px 6px;text-align:center;background:transparent!important;border:1px solid #ccc;}
  .items tbody tr,.items tbody tr:nth-child(even),.items tbody tr:nth-child(odd){background:transparent!important;}
  .items tbody tr{break-inside:avoid;page-break-inside:avoid;}
  .items .left{text-align:left;}
  .items .right{text-align:right;}
  .items .total-row,.items .total-row td{font-weight:700;background:transparent!important;border-top:1.5px solid #222;}
  .items .fill-row td{height:200px;border-left:1px solid #ccc;border-right:1px solid #ccc;border-top:none;border-bottom:none;padding:0;}
  .summary-label{font-weight:700;color:#555;}
  .grand-total{font-size:14px;font-weight:800;color:#111;}
  .bank-section td{padding:3px 8px;font-size:11px;border:none;}
  .bank-label{font-weight:600;color:#555;width:90px;}
  .footer-text{font-size:9px;color:#666;text-align:center;margin-top:8px;}
  .reward-badge{display:inline-block;margin:8px auto;padding:6px 16px;background:transparent;border:1px solid #666;border-radius:4px;font-size:12px;font-weight:600;color:#333;}
  .repeat-banner th{background:transparent!important;border-bottom:1.5px solid #222;text-align:left;padding:6px 8px;font-size:11px;text-transform:none;letter-spacing:0;}
  .paid-stamp{position:absolute;top:80px;right:40px;padding:8px 14px;border:2px solid #222;color:#111;background:transparent;border-radius:4px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;transform:rotate(-12deg);}
  @media print{body{padding:0;} @page{margin:8mm;size:A4;} thead{display:table-header-group;} .no-print{display:none;}
    *{-webkit-print-color-adjust:economy;print-color-adjust:economy;}}
`;
}

/** Indian-style amount in words for invoice footers. */
export function amountInWords(n: number): string {
  if (!Number.isFinite(n) || n === 0) return 'Zero Rupees Only';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
    if (num < 100000)
      return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000)
      return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  };
  const rupees = Math.floor(Math.abs(n));
  const paisa = Math.round((Math.abs(n) - rupees) * 100);
  return `${convert(rupees)} Rupees${paisa ? ` and ${String(paisa).padStart(2, '0')} Paisa` : ''} Only`;
}

const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
};

export function placeOfSupplyLabel(buyerGstin?: string | null, sellerGstin?: string | null): string {
  const code = String(buyerGstin || sellerGstin || '24')
    .trim()
    .toUpperCase()
    .slice(0, 2);
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
  const groups: Record<
    string,
    { productName: string; barcodes: string[]; originalPrice: number; discountPercent: number; netPrice: number }
  > = {};
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

export function generateSalesInvoiceHtml(
  bill: SaleBillData,
  options?: { showGst?: boolean; qrDataUrl?: string },
): string {
  const showGst = options?.showGst ?? true;
  const billConfig =
    ((bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined) ?? {};
  const color = safeColor(billConfig.primaryColor as string);
  const logoHtml = billConfig.logoBase64
    ? `<img src="${safeImgSrc(billConfig.logoBase64)}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div class="logo-icon">${(bill.company.name || 'C').substring(0, 1).toUpperCase()}</div>`;
  const tagline = (billConfig.tagline as string) || '';
  const invPrefix = (billConfig.invoicePrefix as string) || '';
  const showWarranty = billConfig.showWarranty !== false;
  const showRewards = billConfig.showRewards !== false;
  const showBarcode = billConfig.showBarcode !== false;
  // HSN clubbed into GST print mode (settings showGst / legacy showHsnSac)
  const gstSettingOn =
    typeof billConfig.showGst === 'boolean' ? billConfig.showGst !== false : billConfig.showHsnSac !== false;
  const footerText = (billConfig.footerText as string) || 'Powered by Dhandho Management';
  const showHsnCol = showGst && gstSettingOn && !!bill.hsnCode;

  const warrantySection =
    showWarranty && bill.warranty
      ? `
    <div style="margin-top:20px;padding:12px 16px;background:transparent;border:1px solid #666;border-radius:4px;">
      <strong style="color:#111;">Warranty Information</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">
        <tr><td style="color:#6b7280;">Duration</td><td><strong>${bill.warrantyMonths} months</strong></td>
            <td style="color:#6b7280;">Status</td><td><strong>${esc(bill.warranty.status)}</strong></td></tr>
        <tr><td style="color:#6b7280;">Activation</td><td>${fmtDate(bill.warranty.activationDate)}</td>
            <td style="color:#6b7280;">Expiry</td><td>${fmtDate(bill.warranty.expiryDate)}</td></tr>
      </table>
    </div>`
      : '';

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const upiQrSection = billConfig.bankUpiId
    ? (() => {
        const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
        const qrUrl =
          options?.qrDataUrl ||
          `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
        return `<div style="text-align:center;">
      <img src="${qrUrl}" style="width:120px;height:120px;" />
      <p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p>
    </div>`;
      })()
    : '';
  const bankSection =
    hasBankDetails || upiQrSection
      ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        ${
          hasBankDetails
            ? `<div style="flex:1;">
          <strong style="font-size:13px;">Bank Details</strong>
          <table style="width:100%;margin-top:8px;font-size:12px;">
            ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
            ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
            ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
            ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
            ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
          </table>
        </div>`
            : ''
        }
        ${upiQrSection}
      </div>
    </div>`
      : '';

  const tcSection = billConfig.termsAndConditions
    ? `
    <div style="margin-top:16px;font-size:11px;">
      <strong>Terms & Conditions:</strong>
      <p style="white-space:pre-line;color:#6b7280;margin-top:4px;">${esc(billConfig.termsAndConditions)}</p>
    </div>`
    : '';

  const sigSection = billConfig.signatoryName
    ? `
    <div style="margin-top:40px;text-align:right;">
      ${billConfig.signatureBase64 ? `<img src="${safeImgSrc(billConfig.signatureBase64)}" style="height:50px;margin-bottom:4px;" />` : '<div style="height:50px;"></div>'}
      <p style="font-weight:600;font-size:13px;">${esc(billConfig.signatoryName)}</p>
      ${billConfig.signatoryDesignation ? `<p style="font-size:11px;color:#6b7280;">${esc(billConfig.signatoryDesignation)}</p>` : ''}
    </div>`
    : '';

  const gstRate = bill.gstRate || 18;
  const basePrice = Number(bill.salePrice);
  const gstAmount = showGst ? Math.round((basePrice * gstRate) / 100) : 0;
  const halfGst = Math.round(gstAmount / 2);
  const grandTotal = basePrice + gstAmount;
  const sellerGstin = String((bill as unknown as Record<string, unknown>).companyGstin || billConfig.gstNumber || '');
  const buyerGstin = String((bill as unknown as Record<string, unknown>).customerGstin || '');
  const posLabel = placeOfSupplyLabel(buyerGstin, sellerGstin);

  const numberToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (num: number): string => {
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000)
        return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000)
        return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    return (
      convert(Math.round(n)) +
      ' Rupees and ' +
      String(Math.round((n % 1) * 100) || '00').padStart(2, '0') +
      ' Paisa Only'
    );
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Invoice'} - ${esc(invPrefix)}${esc(bill.id)}</title>
<style>${billDocCss(color)}</style></head><body>
<table class="outer title-box avoid-break"><tr><td>${showGst ? 'Tax Invoice' : 'Sales Invoice'}</td></tr></table>
<table class="outer avoid-break" style="margin-top:-1px;">
  <tr class="hdr">
    <td colspan="2" style="width:65%;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoHtml}
        <div>
          <div style="font-size:18px;font-weight:700;color:${color};">${esc(bill.company.name)}</div>
          ${bill.company.address ? `<div style="font-size:10px;color:#555;">${esc(bill.company.address)}</div>` : ''}
          ${bill.company.phone ? `<div style="font-size:10px;color:#555;">Ph: ${esc(bill.company.phone)}</div>` : ''}
          ${showGst && bill.company.gstNumber ? `<div class="gstin-text" style="font-size:11px;margin-top:2px;">GSTIN: ${esc(bill.company.gstNumber)}</div>` : ''}
        </div>
      </div>
    </td>
    <td colspan="2" style="text-align:right;font-size:10px;color:#555;">
      ${tagline ? `<div>${esc(tagline)}</div>` : ''}
      <div style="font-weight:600;margin-top:4px;">ORIGINAL FOR RECIPIENT</div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:0;border-right:1px solid #222;">
      <table style="width:100%;">
        <tr class="cust-row"><td colspan="2" class="section-head">Bill To</td></tr>
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
<table class="outer items" style="margin-top:-1px;">
  <thead>
    <tr>
    <th style="width:30px;">Sr.</th>
    ${showBarcode ? '<th>Barcode</th>' : ''}
    <th class="left">Name of Product / Service</th>
    ${showHsnCol ? '<th>HSN</th>' : ''}
    <th>Qty</th><th>Rate</th><th>Taxable</th>
    ${showGst ? '<th>%</th><th>Tax Amt</th>' : ''}
    <th>Total</th>
  </tr></thead>
  <tbody>
    <tr>
      <td>1</td>
      ${showBarcode ? `<td style="font-family:monospace;font-size:10px;">${esc(bill.barcode)}</td>` : ''}
      <td class="left"><strong>${esc(bill.productName)}</strong>${bill.productDescription ? `<br><span style="font-size:9px;color:#888;">${esc(bill.productDescription)}</span>` : ''}</td>
      ${showHsnCol ? `<td>${esc(bill.hsnCode)}</td>` : ''}
      <td>1</td>
      <td class="right">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="right">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${showGst ? `<td>${gstRate}.00</td><td class="right">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>` : ''}
      <td class="right" style="font-weight:700;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>
    <tr class="total-row"><td></td>${showBarcode ? '<td></td>' : ''}<td class="right"><strong>Total</strong></td>${showHsnCol ? '<td></td>' : ''}<td><strong>1</strong></td><td></td><td class="right"><strong>${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>${showGst ? `<td></td><td class="right"><strong>${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>` : ''}<td class="right" style="font-weight:900;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
  </tbody>
</table>
<div class="print-end avoid-break">
<table class="outer">
  <tr>
    <td style="width:55%;border-right:1px solid #222;vertical-align:top;padding:8px;">
      <div class="summary-label">Total in words</div>
      <div style="text-transform:uppercase;font-size:10px;margin-top:2px;">${numberToWords(grandTotal)}</div>
    </td>
    <td style="padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label" style="padding:3px 8px;">Taxable Amount</td><td class="right" style="padding:3px 8px;">${basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        ${
          showGst
            ? `<tr><td style="padding:3px 8px;">Add : CGST</td><td class="right" style="padding:3px 8px;">${halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:3px 8px;">Add : SGST</td><td class="right" style="padding:3px 8px;">${(gstAmount - halfGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
            : ''
        }
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
    <td style="width:55%;padding:8px 12px;border-right:1px solid #222;vertical-align:top;">
      ${
        hasBankDetails
          ? `<div style="font-weight:700;font-size:11px;margin-bottom:6px;">Bank Details</div>
      <table class="bank-section">
        ${billConfig.bankAccountName ? `<tr><td class="bank-label">Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td class="bank-label">Branch</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? ', ' + esc(billConfig.bankBranch) : ''}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td class="bank-label">Acc. Number</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td class="bank-label">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td class="bank-label">UPI ID</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>`
          : ''
      }
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
${
  tcSection
    ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:6px 12px;font-size:10px;">
  <div style="font-weight:700;margin-bottom:4px;">Terms and Conditions</div>
  <div style="color:#555;white-space:pre-line;">${esc(billConfig.termsAndConditions)}</div>
</td></tr></table>`
    : ''
}
<div class="footer-text">${esc(footerText)}</div>
</div>
</body></html>`;
}

/** Standalone (service) invoice — Vyapar-style bordered sections + GST table at end. */
export type StandaloneInvoicePrintItem = {
  description: string;
  hsnSac?: string;
  qty: number;
  rate: number;
  gstPercent: number;
  discountPercent?: number;
  taxable: number;
  tax: number;
  total: number;
};

export type StandaloneInvoicePrint = {
  invoiceNumber: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  items: StandaloneInvoicePrintItem[];
  subtotal: number;
  taxTotal: number;
  taxCgst?: number;
  taxSgst?: number;
  taxIgst?: number;
  isInterstate?: boolean;
  gstEnabled?: boolean;
  grandTotal: number;
  notes?: string;
  terms?: string;
  status: string;
  invoiceDate: string;
  dueDate?: string;
  paidAmount?: number;
  advanceApplied?: number;
  outstanding?: number;
};

export type StandaloneInvoicePrintCompany = {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
};

/** Shared bill HTML/PDF variant — quotation = same template, title QUOTATION, no bank. */
export type BillDocType = 'invoice' | 'quotation';

export function generateStandaloneInvoiceHtml(
  inv: StandaloneInvoicePrint,
  company: StandaloneInvoicePrintCompany,
  billSettings: Record<string, unknown>,
  options?: { qrDataUrl?: string; hideNotes?: boolean; hasGst?: boolean; docType?: BillDocType },
): string {
  const isQuote = options?.docType === 'quotation';
  const color = safeColor(billSettings.primaryColor as string);
  const logoSrc = safeImgSrc(billSettings.logoBase64);
  const sigSrc = safeImgSrc(billSettings.signatureBase64);
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div style="width:48px;height:48px;border:1px solid #222;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;">${esc((company.companyName || 'C').substring(0, 1))}</div>`;
  const tagline = String(billSettings.tagline || '');
  const invPrefix = isQuote ? '' : String(billSettings.invoicePrefix || '');
  const footerText = String(billSettings.footerText || 'Powered by Dhandho Management');
  const hasGst = options?.hasGst ?? inv.gstEnabled === true;
  const docTitle = isQuote ? 'Quotation' : hasGst ? 'Tax Invoice' : 'Invoice';
  const numberLabel = isQuote ? 'Quotation No' : 'Invoice No';
  const dueLabel = isQuote ? 'Valid until' : 'Due';
  const certText = isQuote
    ? 'This quotation is subject to confirmation.'
    : 'Certified that the particulars given above are true and correct.';
  const useIgst = inv.isInterstate === true || (typeof inv.taxIgst === 'number' && inv.taxIgst > 0);
  const taxCgst = typeof inv.taxCgst === 'number' ? inv.taxCgst : Math.round((inv.taxTotal || 0) / 2);
  const taxSgst =
    typeof inv.taxSgst === 'number' ? inv.taxSgst : Math.round(((inv.taxTotal || 0) - taxCgst) * 100) / 100;
  const taxIgst = typeof inv.taxIgst === 'number' ? inv.taxIgst : inv.taxTotal || 0;
  const showDiscCol = inv.items.some(it => (it.discountPercent || 0) > 0);
  const showHsn = hasGst;
  const posLabel = placeOfSupplyLabel(inv.customerGstin, company.gstNumber);
  const money = (n: number) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const qtyTotal = inv.items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const taxTotalAmt = inv.items.reduce((s, it) => s + Number(it.tax || 0), 0);
  const amountTotal = inv.items.reduce((s, it) => s + Number(it.total || 0), 0);
  const received = Number(inv.paidAmount || 0);
  const balance =
    typeof inv.outstanding === 'number'
      ? inv.outstanding
      : Math.max(0, Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0));
  const showPaymentRows =
    !isQuote ||
    received > 0.001 ||
    (inv.advanceApplied || 0) > 0.001 ||
    (typeof inv.outstanding === 'number' && inv.outstanding > 0.001);

  // HSN-wise GST summary (end of bill — matches classic Tax Invoice layout)
  const hsnMap = new Map<
    string,
    { taxable: number; tax: number; rate: number; cgst: number; sgst: number; igst: number }
  >();
  for (const it of inv.items) {
    const key = String(it.hsnSac || '—').trim() || '—';
    const cur = hsnMap.get(key) || { taxable: 0, tax: 0, rate: Number(it.gstPercent || 0), cgst: 0, sgst: 0, igst: 0 };
    cur.taxable += Number(it.taxable || 0);
    cur.tax += Number(it.tax || 0);
    cur.rate = Number(it.gstPercent || cur.rate || 0);
    if (useIgst) cur.igst += Number(it.tax || 0);
    else {
      cur.cgst += Number(it.tax || 0) / 2;
      cur.sgst += Number(it.tax || 0) / 2;
    }
    hsnMap.set(key, cur);
  }

  const colCount =
    5 + (showHsn ? 1 : 0) + (showDiscCol ? 1 : 0) + (hasGst ? 2 : 0); /* # name [hsn] qty rate [disc] [gst tax] amt */

  // Quotations never show bank / UPI (invoice-only).
  const hasBank =
    !isQuote &&
    !!(
      billSettings.bankAccountName ||
      billSettings.bankAccountNumber ||
      billSettings.bankName ||
      billSettings.bankUpiId
    );
  const upiQr =
    !isQuote && billSettings.bankUpiId && options?.qrDataUrl
      ? `<div style="text-align:center;"><img src="${options.qrDataUrl}" style="width:100px;height:100px;" /><div style="font-size:9px;color:#666;margin-top:2px;">Scan to pay via UPI</div></div>`
      : '';

  const termsText = String(billSettings.termsAndConditions || inv.terms || '');
  const companyName = company.companyName || 'Dhandho';

  const itemRows = inv.items
    .map((it, i) => {
      const disc = it.discountPercent || 0;
      return `<tr>
      <td>${i + 1}</td>
      <td class="left">${esc(it.description)}</td>
      ${showHsn ? `<td>${esc(it.hsnSac || '—')}</td>` : ''}
      <td>${it.qty}</td>
      <td class="right">${money(it.rate)}</td>
      ${showDiscCol ? `<td class="right">${disc > 0 ? `${disc}%` : '—'}</td>` : ''}
      ${hasGst ? `<td class="right">${Number(it.gstPercent || 0).toFixed(1)}%</td><td class="right">${money(it.tax)}</td>` : ''}
      <td class="right">${money(it.total)}</td>
    </tr>`;
    })
    .join('');

  const gstSummaryRows = [...hsnMap.entries()]
    .map(
      ([hsn, row]) => `<tr>
      <td>${esc(hsn)}</td>
      <td class="right">${money(row.taxable)}</td>
      ${
        useIgst
          ? `<td class="right">${row.rate.toFixed(1)}</td><td class="right">${money(row.igst)}</td>`
          : `<td class="right">${(row.rate / 2).toFixed(1)}</td><td class="right">${money(row.cgst)}</td>
      <td class="right">${(row.rate / 2).toFixed(1)}</td><td class="right">${money(row.sgst)}</td>`
      }
      <td class="right">${money(row.tax)}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(docTitle)} — ${esc(invPrefix)}${esc(inv.invoiceNumber)}</title>
<style>${billDocCss(color)}</style></head><body>
<table class="outer title-box avoid-break"><tr><td>${esc(docTitle)}</td></tr></table>
<table class="outer avoid-break" style="margin-top:-1px;">
  <tr class="hdr">
    <td style="width:62%;border-right:1px solid #222;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        ${logoHtml}
        <div>
          <div style="font-size:16px;font-weight:700;color:${color};">${esc(companyName)}</div>
          ${company.address ? `<div style="font-size:10px;color:#555;">${esc(company.address)}</div>` : ''}
          ${company.phone ? `<div style="font-size:10px;color:#555;">Phone: ${esc(company.phone)}</div>` : ''}
          ${company.email ? `<div style="font-size:10px;color:#555;">Email: ${esc(company.email)}</div>` : ''}
          ${hasGst && company.gstNumber ? `<div class="gstin-text" style="margin-top:2px;">GSTIN: ${esc(company.gstNumber)}</div>` : ''}
          ${tagline ? `<div class="tagline" style="margin-top:6px;display:inline-block;padding:2px 8px;">${esc(tagline)}</div>` : ''}
        </div>
      </div>
    </td>
    <td style="vertical-align:top;">
      <table style="width:100%;">
        <tr class="cust-row"><td class="cust-label">${esc(numberLabel)}</td><td><strong style="font-family:monospace;">${esc(invPrefix)}${esc(inv.invoiceNumber)}</strong></td></tr>
        <tr class="cust-row"><td class="cust-label">Date</td><td><strong>${fmtDate(inv.invoiceDate)}</strong></td></tr>
        ${inv.dueDate ? `<tr class="cust-row"><td class="cust-label">${esc(dueLabel)}</td><td>${fmtDate(inv.dueDate)}</td></tr>` : ''}
        ${!isQuote && inv.status === 'paid' ? '<tr class="cust-row"><td class="cust-label">Status</td><td><strong>PAID</strong></td></tr>' : ''}
        ${isQuote && inv.status ? `<tr class="cust-row"><td class="cust-label">Status</td><td><strong>${esc(inv.status)}</strong></td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>
<table class="outer avoid-break" style="margin-top:-1px;">
  <tr><td class="section-head" style="color:#111;">Bill To</td></tr>
  <tr><td style="padding:8px 10px;">
    <strong>${esc(inv.customerName)}</strong>
    ${inv.customerPhone ? `<div style="font-size:10px;color:#555;margin-top:2px;">Ph: ${esc(inv.customerPhone)}</div>` : ''}
    ${inv.customerAddress ? `<div style="font-size:10px;color:#555;">${esc(inv.customerAddress)}</div>` : ''}
    ${inv.customerGstin ? `<div class="gstin-text" style="margin-top:2px;">GSTIN: ${esc(inv.customerGstin)}</div>` : ''}
    ${hasGst ? `<div style="font-size:10px;color:#555;margin-top:2px;">Place of Supply: ${esc(posLabel)}</div>` : ''}
  </td></tr>
</table>
<table class="outer items" style="margin-top:-1px;">
  <thead>
    <tr>
      <th style="width:28px;">#</th>
      <th class="left">Item Name</th>
      ${showHsn ? '<th>HSN/SAC</th>' : ''}
      <th>Qty</th>
      <th class="right">Price/Unit</th>
      ${showDiscCol ? '<th class="right">Disc%</th>' : ''}
      ${hasGst ? '<th class="right">GST%</th><th class="right">Tax Amt</th>' : ''}
      <th class="right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
    <tr class="fill-row"><td colspan="${colCount}"></td></tr>
    <tr class="total-row">
      <td></td>
      <td class="right"><strong>Total</strong></td>
      ${showHsn ? '<td></td>' : ''}
      <td><strong>${qtyTotal}</strong></td>
      <td></td>
      ${showDiscCol ? '<td></td>' : ''}
      ${hasGst ? `<td></td><td class="right"><strong>${money(taxTotalAmt)}</strong></td>` : ''}
      <td class="right"><strong>${money(amountTotal)}</strong></td>
    </tr>
  </tbody>
</table>
<div class="print-end avoid-break">
<table class="outer" style="margin-top:-1px;">
  <tr>
    <td style="width:50%;border-right:1px solid #222;vertical-align:top;padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label">Sub Total</td><td class="right">${money(inv.subtotal)}</td></tr>
        ${
          showPaymentRows && (inv.advanceApplied || 0) > 0.001
            ? `<tr><td>Advance</td><td class="right">−${money(inv.advanceApplied || 0)}</td></tr>`
            : ''
        }
        ${showPaymentRows ? `<tr><td>Received</td><td class="right">${money(received)}</td></tr>` : ''}
      </table>
    </td>
    <td style="vertical-align:top;padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label">Total</td><td class="right grand-total">${money(inv.grandTotal)}</td></tr>
        <tr><td colspan="2" style="font-size:9px;color:#555;text-transform:uppercase;">(${esc(amountInWords(inv.grandTotal))})</td></tr>
        ${showPaymentRows ? `<tr><td><strong>Balance</strong></td><td class="right"><strong>${money(balance)}</strong></td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>
${
  hasGst
    ? `<table class="outer items" style="margin-top:-1px;">
  <thead>
    <tr>
      <th>HSN/SAC</th>
      <th class="right">Taxable Amount</th>
      ${
        useIgst
          ? '<th class="right">IGST Rate %</th><th class="right">IGST Amt</th>'
          : '<th class="right">CGST Rate %</th><th class="right">CGST Amt</th><th class="right">SGST Rate %</th><th class="right">SGST Amt</th>'
      }
      <th class="right">Total Tax</th>
    </tr>
  </thead>
  <tbody>
    ${gstSummaryRows}
    <tr class="total-row">
      <td class="right"><strong>Total</strong></td>
      <td class="right"><strong>${money(inv.subtotal)}</strong></td>
      ${
        useIgst
          ? `<td></td><td class="right"><strong>${money(taxIgst)}</strong></td>`
          : `<td></td><td class="right"><strong>${money(taxCgst)}</strong></td><td></td><td class="right"><strong>${money(taxSgst)}</strong></td>`
      }
      <td class="right"><strong>${money(inv.taxTotal)}</strong></td>
    </tr>
  </tbody>
</table>`
    : ''
}
${!options?.hideNotes && inv.notes ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:8px;"><strong>Notes:</strong> ${esc(inv.notes)}</td></tr></table>` : ''}
<table class="outer" style="margin-top:-1px;">
  <tr>
    <td style="width:55%;border-right:1px solid #222;vertical-align:top;padding:8px 10px;">
      ${
        hasBank
          ? `<div style="font-weight:700;margin-bottom:6px;">Bank Details</div>
      <table class="bank-section">
        ${billSettings.bankAccountName ? `<tr><td class="bank-label">Name</td><td>${esc(billSettings.bankAccountName)}</td></tr>` : ''}
        ${billSettings.bankName ? `<tr><td class="bank-label">Bank</td><td>${esc(billSettings.bankName)}${billSettings.bankBranch ? `, ${esc(billSettings.bankBranch)}` : ''}</td></tr>` : ''}
        ${billSettings.bankAccountNumber ? `<tr><td class="bank-label">A/c No.</td><td style="font-family:monospace;">${esc(billSettings.bankAccountNumber)}</td></tr>` : ''}
        ${billSettings.bankIfsc ? `<tr><td class="bank-label">IFSC</td><td style="font-family:monospace;">${esc(billSettings.bankIfsc)}</td></tr>` : ''}
        ${billSettings.bankUpiId ? `<tr><td class="bank-label">UPI</td><td>${esc(billSettings.bankUpiId)}</td></tr>` : ''}
      </table>${upiQr ? `<div style="margin-top:8px;">${upiQr}</div>` : ''}`
          : upiQr || '<div style="font-size:10px;color:#666;">—</div>'
      }
    </td>
    <td style="vertical-align:top;padding:8px 10px;text-align:right;">
      <div style="font-size:9px;color:#666;margin-bottom:4px;">${esc(certText)}</div>
      <div style="font-weight:700;margin-bottom:8px;">For ${esc(companyName)}</div>
      ${sigSrc ? `<img src="${sigSrc}" style="height:48px;margin-bottom:4px;" />` : '<div style="height:48px;border:1px dashed #ccc;margin:0 0 4px auto;width:140px;"></div>'}
      ${billSettings.signatoryName ? `<div style="font-size:11px;font-weight:600;">${esc(billSettings.signatoryName)}</div>` : ''}
      ${billSettings.signatoryDesignation ? `<div style="font-size:10px;color:#666;">${esc(billSettings.signatoryDesignation)}</div>` : ''}
      <div style="border-top:1px solid #333;margin-top:6px;padding-top:4px;font-size:10px;font-weight:600;">Authorized Signatory</div>
    </td>
  </tr>
</table>
${
  termsText
    ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:6px 10px;font-size:10px;">
  <div style="font-weight:700;margin-bottom:4px;">Terms and Conditions</div>
  <div style="color:#555;white-space:pre-line;">${esc(termsText)}</div>
</td></tr></table>`
    : ''
}
<div class="footer-text">${esc(footerText)}</div>
</div>
</body></html>`;
}

export function generateDistributionChallanHtml(
  bill: DistributionBillData,
  options?: {
    showGst?: boolean;
    fullyPaid?: boolean;
    qrDataUrl?: string;
    irnQrDataUrl?: string;
  },
): string {
  const showGst = options?.showGst ?? true;
  const fullyPaid = options?.fullyPaid ?? false;
  const billConfig =
    ((bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined) ?? {};
  const color = safeColor(billConfig.primaryColor as string);
  const logoHtml = billConfig.logoBase64
    ? `<img src="${safeImgSrc(billConfig.logoBase64)}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
    : `<div class="logo-icon">${(bill.company.name || 'C').substring(0, 1).toUpperCase()}</div>`;
  const tagline = (billConfig.tagline as string) || '';
  const chPrefix = (billConfig.challanPrefix as string) || '';
  const footerText = (billConfig.footerText as string) || 'Powered by Dhandho Management';
  const showHsnCol =
    showGst &&
    (typeof billConfig.showGst === 'boolean' ? billConfig.showGst !== false : billConfig.showHsnSac !== false);
  const ewbNumber = bill.ewbNumber || '';
  const irn = bill.irn || '';
  const irnAckNo = bill.irnAckNo || '';
  const irnAckDt = bill.irnAckDt || '';
  const irnQrPayload = bill.irnQr || '';
  const irnQrSrc =
    options?.irnQrDataUrl ||
    (irnQrPayload
      ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(irnQrPayload)}`
      : '');

  const hasBankDetails = billConfig.bankAccountName || billConfig.bankAccountNumber || billConfig.bankName;
  const upiQrSection = billConfig.bankUpiId
    ? (() => {
        const upiLink = `upi://pay?pa=${encodeURIComponent(String(billConfig.bankUpiId))}&pn=${encodeURIComponent(String(billConfig.bankAccountName || 'Business'))}&cu=INR`;
        const qrUrl =
          options?.qrDataUrl ||
          `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiLink)}`;
        return `<div style="text-align:center;">
      <img src="${qrUrl}" style="width:120px;height:120px;" />
      <p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p>
    </div>`;
      })()
    : '';
  const bankSection =
    hasBankDetails || upiQrSection
      ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        ${
          hasBankDetails
            ? `<div style="flex:1;">
          <strong style="font-size:13px;">Bank Details</strong>
          <table style="width:100%;margin-top:8px;font-size:12px;">
            ${billConfig.bankAccountName ? `<tr><td style="color:#6b7280;width:120px;">Account Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
            ${billConfig.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
            ${billConfig.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? `, ${esc(billConfig.bankBranch)}` : ''}</td></tr>` : ''}
            ${billConfig.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
            ${billConfig.bankUpiId ? `<tr><td style="color:#6b7280;">UPI</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
          </table>
        </div>`
            : ''
        }
        ${upiQrSection}
      </div>
    </div>`
      : '';

  const tcSection = billConfig.termsAndConditions
    ? `
    <div style="margin-top:16px;font-size:11px;">
      <strong>Terms & Conditions:</strong>
      <p style="white-space:pre-line;color:#6b7280;margin-top:4px;">${esc(billConfig.termsAndConditions)}</p>
    </div>`
    : '';

  const gstRate = bill.gstRate || 18;
  const netVal = bill.totalValue;
  // Prefer stored billed totals when available (matches books); else exclusive calc on net
  const billedFromItems =
    bill.groupedItems?.reduce((s, g) => {
      const line = Number((g as Record<string, unknown>).billedLineTotal ?? g.lineTotal) || 0;
      return s + line;
    }, 0) ?? 0;
  const gstAmount = showGst
    ? billedFromItems > netVal
      ? Math.round(billedFromItems - netVal)
      : Math.round((netVal * gstRate) / 100)
    : 0;
  const halfGst = Math.round(gstAmount / 2);
  const grandTotal = netVal + gstAmount;
  const vendorGstin = ((bill.vendor as Record<string, unknown>).gstNumber as string) || '';
  const sellerGstin = String(billConfig.gstNumber || (bill as unknown as Record<string, unknown>).companyGstin || '');
  const posLabel = placeOfSupplyLabel(vendorGstin, sellerGstin);

  const numberToWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (num: number): string => {
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + convert(num % 100) : '');
      if (num < 100000)
        return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
      if (num < 10000000)
        return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
      return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
    };
    return (
      convert(Math.round(n)) +
      ' Rupees and ' +
      String(Math.round((n % 1) * 100) || '00').padStart(2, '0') +
      ' Paisa Only'
    );
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${showGst ? 'Tax Invoice' : 'Challan'} - ${esc(chPrefix)}${esc(bill.challanId)}</title>
<style>${billDocCss(color)}
  .summary-row td{padding:4px 8px;font-size:11px;vertical-align:top;}
  .sig-section{margin-top:0;}
  .sig-section td{border:none;padding:6px 12px;vertical-align:bottom;height:60px;}
</style></head><body>
<div style="position:relative;">
${fullyPaid ? '<div class="paid-stamp">PAID</div>' : ''}
<div class="doc-title">${showGst ? 'Tax Invoice' : 'Challan'}</div>
<table class="outer">
  <tr class="hdr">
    <td colspan="2" style="width:65%;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logoHtml}
        <div>
          <div style="font-size:18px;font-weight:700;color:${color};">${esc(bill.company.name)}</div>
          ${bill.company.address ? `<div style="font-size:10px;color:#555;">${esc(bill.company.address)}</div>` : ''}
          ${bill.company.phone ? `<div style="font-size:10px;color:#555;">Ph: ${esc(bill.company.phone)}</div>` : ''}
          ${showGst && bill.company.gstNumber ? `<div class="gstin-text" style="font-size:11px;margin-top:2px;">GSTIN: ${esc(bill.company.gstNumber)}</div>` : ''}
        </div>
      </div>
    </td>
    <td colspan="2" style="text-align:right;font-size:10px;color:#555;">
      ${tagline ? `<div style="font-size:10px;color:#666;">${esc(tagline)}</div>` : ''}
      <div style="font-weight:600;margin-top:4px;">ORIGINAL FOR RECIPIENT</div>
    </td>
  </tr>

  <tr>
    <td colspan="2" style="padding:0;border-right:1px solid #222;">
      <table style="width:100%;">
        <tr class="cust-row"><td colspan="2" class="section-head">Bill To</td></tr>
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
      ${
        irnQrSrc
          ? `<div style="padding:8px;text-align:center;border-top:1px solid #eee;">
        <img src="${irnQrSrc}" style="width:120px;height:120px;" alt="E-Invoice QR" />
        <div style="font-size:9px;color:#666;margin-top:2px;font-weight:600;">e-Invoice QR</div>
      </div>`
          : ''
      }
    </td>
  </tr>
</table>

<!-- Item Table -->
<table class="outer items" style="margin-top:-1px;">
  <thead>
    <tr>
    <th style="width:30px;">Sr.<br>No.</th>
    <th class="left">Name of Product / Service</th>
    ${showHsnCol ? '<th>HSN / SAC</th>' : ''}
    <th>Qty</th>
    <th>Rate</th>
    <th>Taxable Value</th>
    ${showGst ? `<th colspan="2">${vendorGstin ? 'CGST' : 'IGST'}</th>` : ''}
    <th>Total</th>
  </tr>
  ${
    showGst
      ? `<tr>
    <th></th><th></th>${showHsnCol ? '<th></th>' : ''}<th></th><th></th><th></th>
    <th>%</th><th>Amount</th><th></th>
  </tr>`
      : ''
  }</thead>
  <tbody>
  ${bill.groupedItems
    .map(g => {
      const lineGst = showGst ? Math.round((g.lineTotal * gstRate) / 100) : 0;
      return `<tr>
      <td>${g.sno}</td>
      <td class="left"><strong>${esc(g.productName)}</strong>${(g as Record<string, unknown>).packQuantity ? ` <span style="font-size:9px;color:#666;">${esc((g as Record<string, unknown>).packQuantity)}</span>` : ''}</td>
      ${showHsnCol ? `<td>${esc(((g as Record<string, unknown>).hsnCode as string) || '-')}</td>` : ''}
      <td>${g.quantity}</td>
      <td class="right">${g.netPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="right">${g.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${showGst ? `<td>${gstRate}.00</td><td class="right">${lineGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>` : ''}
      <td class="right" style="font-weight:700;">${(g.lineTotal + lineGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`;
    })
    .join('')}
  <tr class="total-row">
    <td></td><td class="right"><strong>Total</strong></td>
    ${showHsnCol ? '<td></td>' : ''}
    <td><strong>${bill.totalQuantity}</strong></td>
    <td></td>
    <td class="right"><strong>${netVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
    ${showGst ? `<td></td><td class="right"><strong>${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>` : ''}
    <td class="right" style="font-weight:900;">${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
  </tr>
  </tbody>
</table>

<div class="print-end avoid-break">
<!-- Summary: Total in Words + Tax Breakdown -->
<table class="outer">
  <tr class="summary-row">
    <td style="width:55%;border-right:1px solid #222;">
      <div class="summary-label">Total in words</div>
      <div style="text-transform:uppercase;font-size:10px;margin-top:2px;">${numberToWords(grandTotal)}</div>
    </td>
    <td style="padding:0;">
      <table style="width:100%;">
        <tr><td class="summary-label" style="padding:3px 8px;">Taxable Amount</td><td class="right" style="padding:3px 8px;">${netVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
        ${
          showGst
            ? vendorGstin
              ? `<tr><td style="padding:3px 8px;">Add : CGST</td><td class="right" style="padding:3px 8px;">${halfGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
             <tr><td style="padding:3px 8px;">Add : SGST</td><td class="right" style="padding:3px 8px;">${(gstAmount - halfGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
              : `<tr><td style="padding:3px 8px;">Add : IGST</td><td class="right" style="padding:3px 8px;">${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
            : ''
        }
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
    <td style="width:55%;padding:8px 12px;border-right:1px solid #222;vertical-align:top;">
      ${
        hasBankDetails
          ? `<div style="font-weight:700;font-size:11px;margin-bottom:6px;">Bank Details</div>
      <table class="bank-section">
        ${billConfig.bankAccountName ? `<tr><td class="bank-label">Name</td><td>${esc(billConfig.bankAccountName)}</td></tr>` : ''}
        ${billConfig.bankName ? `<tr><td class="bank-label">Branch</td><td>${esc(billConfig.bankName)}${billConfig.bankBranch ? ', ' + esc(billConfig.bankBranch) : ''}</td></tr>` : ''}
        ${billConfig.bankAccountNumber ? `<tr><td class="bank-label">Acc. Number</td><td style="font-family:monospace;">${esc(billConfig.bankAccountNumber)}</td></tr>` : ''}
        ${billConfig.bankIfsc ? `<tr><td class="bank-label">IFSC</td><td style="font-family:monospace;">${esc(billConfig.bankIfsc)}</td></tr>` : ''}
        ${billConfig.bankUpiId ? `<tr><td class="bank-label">UPI ID</td><td>${esc(billConfig.bankUpiId)}</td></tr>` : ''}
      </table>`
          : ''
      }
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

${
  tcSection
    ? `<table class="outer" style="margin-top:-1px;"><tr><td style="padding:6px 12px;font-size:10px;">
  <div style="font-weight:700;margin-bottom:4px;">Terms and Conditions</div>
  <div style="color:#555;white-space:pre-line;">${esc(billConfig.termsAndConditions)}</div>
</td></tr></table>`
    : ''
}

<div class="footer-text">${esc(footerText)}</div>
</div>
</div>
</body></html>`;
}

/** Quotation print — same branding header as invoices / challans (bill settings). */
export type QuotationBillInput = {
  quotationNumber: string;
  quotationDate: string;
  validUntil?: string | null;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  vendorName?: string | null;
  items: {
    productName: string;
    quantity: number;
    price: number;
    discountPercent: number;
    withGst: boolean;
    lineNet: number;
    lineGst: number;
    lineTotal: number;
  }[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  notes?: string | null;
  company: {
    name: string;
    phone?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    email?: string | null;
  };
  billSettings?: Record<string, unknown> | null;
};

/** Map quotation fields onto the shared standalone bill print shape. */
export function quotationToStandalonePrint(q: QuotationBillInput): StandaloneInvoicePrint {
  const hasGst = (q.gstAmount || 0) > 0;
  return {
    invoiceNumber: q.quotationNumber,
    customerName: q.customerName || q.vendorName || 'Customer',
    customerPhone: q.customerPhone || undefined,
    items: q.items.map(it => ({
      description: it.productName,
      qty: it.quantity,
      rate: it.price,
      gstPercent: it.withGst ? q.gstRate : 0,
      discountPercent: it.discountPercent,
      taxable: it.lineNet,
      tax: it.lineGst,
      total: it.lineTotal,
    })),
    subtotal: q.subtotal,
    taxTotal: q.gstAmount,
    gstEnabled: hasGst,
    grandTotal: q.total,
    notes: q.notes || undefined,
    status: q.status,
    invoiceDate: q.quotationDate,
    dueDate: q.validUntil || undefined,
  };
}

/** Quotation print HTML — same billSettings template as Tax Invoice (no bank). */
export function generateQuotationHtml(q: QuotationBillInput, options?: { hideNotes?: boolean }): string {
  return generateStandaloneInvoiceHtml(
    quotationToStandalonePrint(q),
    {
      companyName: q.company.name || 'Dhandho',
      address: q.company.address || undefined,
      phone: q.company.phone || undefined,
      email: q.company.email || undefined,
      gstNumber: q.company.gstNumber || undefined,
    },
    q.billSettings || {},
    {
      hideNotes: options?.hideNotes,
      hasGst: (q.gstAmount || 0) > 0,
      docType: 'quotation',
    },
  );
}
