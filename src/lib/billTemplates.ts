import type { SaleBillData, DistributionBillData } from '../api';

export function generateSalesInvoiceHtml(bill: SaleBillData, options?: { showGst?: boolean }): string {
  const showGst = options?.showGst ?? true;
  const warrantySection = bill.warranty ? `
    <div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <strong style="color:#166534;">Warranty Information</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">
        <tr><td style="color:#6b7280;">Duration</td><td><strong>${bill.warrantyMonths} months</strong></td>
            <td style="color:#6b7280;">Status</td><td><strong>${bill.warranty.status}</strong></td></tr>
        <tr><td style="color:#6b7280;">Activation</td><td>${bill.warranty.activationDate}</td>
            <td style="color:#6b7280;">Expiry</td><td>${bill.warranty.expiryDate}</td></tr>
      </table>
    </div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Invoice - ${bill.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto;}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #F27D26;padding-bottom:20px;margin-bottom:24px;}
  .logo{display:flex;align-items:center;gap:12px;}
  .logo-icon{width:48px;height:48px;background:#F27D26;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px;}
  .company-name{font-size:24px;font-weight:bold;letter-spacing:1px;}
  .company-details{font-size:12px;color:#6b7280;text-align:right;}
  .invoice-title{font-size:20px;font-weight:bold;color:#F27D26;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;}
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
  .totals .total-row{font-size:18px;font-weight:bold;color:#F27D26;border-top:2px solid #F27D26;padding-top:10px;margin-top:6px;}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;}
  .reward-badge{display:inline-block;margin-top:12px;padding:6px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:20px;font-size:12px;font-weight:600;color:#92400e;}
  @media print{body{padding:20px;} .no-print{display:none;}}
</style></head><body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">S</div>
      <div>
        <div class="company-name">${bill.company.name}</div>
        <div style="font-size:11px;color:#6b7280;">Inventory & Rewards Management</div>
      </div>
    </div>
    <div class="company-details">
      ${bill.company.address ? `<div>${bill.company.address}</div>` : ''}
      ${bill.company.phone ? `<div>Phone: ${bill.company.phone}</div>` : ''}
      ${showGst && bill.company.gstNumber ? `<div style="font-weight:600;">GSTIN: ${bill.company.gstNumber}</div>` : ''}
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <div class="invoice-title">${showGst ? 'Tax Invoice' : 'Invoice'}</div>
    <div style="text-align:right;font-size:13px;">
      <div><strong>Invoice No:</strong> ${bill.id}</div>
      <div><strong>Date:</strong> ${bill.purchaseDate}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <h4>Bill To (Customer)</h4>
      <p><strong>${bill.customerName}</strong></p>
      <p>Phone: ${bill.customerPhone}</p>
      ${bill.customerEmail ? `<p>Email: ${bill.customerEmail}</p>` : ''}
    </div>
    <div class="info-box">
      <h4>Sold By (Vendor)</h4>
      <p><strong>${bill.vendor.name}</strong></p>
      ${bill.vendor.contactPerson ? `<p>${bill.vendor.contactPerson}</p>` : ''}
      ${bill.vendor.phone ? `<p>Phone: ${bill.vendor.phone}</p>` : ''}
      ${bill.vendor.address ? `<p>${bill.vendor.address}</p>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr><th>Barcode</th><th>Product</th>${showGst && bill.hsnCode ? '<th>HSN</th>' : ''}<th>Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>
      <tr>
        <td style="font-family:monospace;">${bill.barcode}</td>
        <td><strong>${bill.productName}</strong>${bill.productDescription ? `<br/><span style="color:#6b7280;font-size:11px;">${bill.productDescription}</span>` : ''}</td>
        ${showGst && bill.hsnCode ? `<td>${bill.hsnCode}</td>` : ''}
        <td>1</td>
        <td style="text-align:right;">₹${Number(bill.salePrice).toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold;">₹${Number(bill.salePrice).toLocaleString()}</td>
      </tr>
    </tbody>
  </table>
  ${(() => {
    const price = Number(bill.salePrice);
    if (!showGst) {
      return `<div class="totals">
        <div class="row total-row"><span>Total</span><span>₹${price.toLocaleString()}</span></div>
      </div>`;
    }
    const gstRate = bill.gstRate || 18;
    const basePrice = Math.round(price * 100 / (100 + gstRate));
    const gstAmount = price - basePrice;
    const halfGst = Math.round(gstAmount / 2);
    return `<div class="totals">
      <div class="row"><span>Base Price</span><span>₹${basePrice.toLocaleString()}</span></div>
      <div class="row"><span>CGST @ ${gstRate / 2}%</span><span>₹${halfGst.toLocaleString()}</span></div>
      <div class="row"><span>SGST @ ${gstRate / 2}%</span><span>₹${(gstAmount - halfGst).toLocaleString()}</span></div>
      <div class="row total-row"><span>Grand Total (incl. GST)</span><span>₹${price.toLocaleString()}</span></div>
    </div>`;
  })()}
  ${warrantySection}
  ${bill.rewardPointsEarned > 0 ? `<div style="text-align:center;"><span class="reward-badge">+${bill.rewardPointsEarned} Reward Points Earned</span></div>` : ''}
  ${bill.vendorFinance ? `
    <div style="margin-top:20px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
      <strong style="font-size:13px;">Vendor Account Summary</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">
        <tr><td style="color:#6b7280;padding:3px 0;">Total Distributed Value</td><td style="text-align:right;font-weight:600;">₹${bill.vendorFinance.totalDistributedValue.toLocaleString()}</td></tr>
        <tr><td style="color:#16a34a;padding:3px 0;">Amount Paid</td><td style="text-align:right;font-weight:600;color:#16a34a;">₹${bill.vendorFinance.totalPaid.toLocaleString()}</td></tr>
        <tr style="border-top:2px solid #F27D26;"><td style="padding:6px 0;font-weight:700;${bill.vendorFinance.balance > 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">Balance Remaining</td><td style="text-align:right;font-weight:700;font-size:15px;${bill.vendorFinance.balance > 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">₹${bill.vendorFinance.balance.toLocaleString()}</td></tr>
      </table>
    </div>` : ''}
  ${bill.vendorFinance && bill.vendorFinance.balance <= 0 ? `<div style="text-align:center;margin-top:16px;"><span style="display:inline-block;padding:8px 32px;border:3px solid #16a34a;color:#16a34a;font-size:24px;font-weight:900;letter-spacing:6px;text-transform:uppercase;border-radius:8px;transform:rotate(-3deg);opacity:0.7;">PAID</span></div>` : ''}
  <div class="footer">
    <p>Thank you for your purchase!</p>
    <p style="margin-top:4px;">This is a computer-generated invoice. No signature required.</p>
  </div>
</body></html>`;
}

export function generateDistributionChallanHtml(bill: DistributionBillData, options?: { showGst?: boolean }): string {
  const showGst = options?.showGst ?? true;
  const itemRows = bill.items.map((item) => `
    <tr>
      <td style="text-align:center;">${item.sno}</td>
      <td style="font-family:monospace;">${item.barcode}</td>
      <td>${item.productName}</td>
      <td style="text-align:right;">₹${Number(item.price).toLocaleString()}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Distribution Challan - ${bill.challanId}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto;}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #F27D26;padding-bottom:20px;margin-bottom:24px;}
  .logo{display:flex;align-items:center;gap:12px;}
  .logo-icon{width:48px;height:48px;background:#F27D26;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px;}
  .company-name{font-size:24px;font-weight:bold;letter-spacing:1px;}
  .company-details{font-size:12px;color:#6b7280;text-align:right;}
  .challan-title{font-size:20px;font-weight:bold;color:#F27D26;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;}
  .info-box{padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;}
  .info-box h4{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px;}
  .info-box p{font-size:13px;margin:2px 0;}
  table.items{width:100%;border-collapse:collapse;margin-top:16px;}
  table.items th{background:#151619;color:white;padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
  table.items td{padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;}
  .summary{margin-top:20px;display:flex;justify-content:flex-end;gap:40px;padding:12px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;}
  .summary strong{color:#F27D26;}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px;padding-top:16px;}
  .sig-box{text-align:center;padding-top:40px;border-top:1px solid #1a1a1a;}
  .sig-box p{font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;}
  @media print{body{padding:20px;} .no-print{display:none;}}
</style></head><body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">S</div>
      <div>
        <div class="company-name">${bill.company.name}</div>
        <div style="font-size:11px;color:#6b7280;">Inventory & Rewards Management</div>
      </div>
    </div>
    <div class="company-details">
      ${bill.company.address ? `<div>${bill.company.address}</div>` : ''}
      ${bill.company.phone ? `<div>Phone: ${bill.company.phone}</div>` : ''}
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <div class="challan-title">Distribution Challan</div>
    <div style="text-align:right;font-size:13px;">
      <div><strong>Challan No:</strong> ${bill.challanId}</div>
      <div><strong>Date:</strong> ${bill.distributionDate}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <h4>From (Company)</h4>
      <p><strong>${bill.company.name}</strong></p>
      ${bill.company.contactName ? `<p>${bill.company.contactName}</p>` : ''}
      ${bill.company.phone ? `<p>Phone: ${bill.company.phone}</p>` : ''}
      ${bill.company.address ? `<p>${bill.company.address}</p>` : ''}
    </div>
    <div class="info-box">
      <h4>To (Vendor)</h4>
      <p><strong>${bill.vendor.name}</strong></p>
      ${bill.vendor.contactPerson ? `<p>${bill.vendor.contactPerson}</p>` : ''}
      ${bill.vendor.phone ? `<p>Phone: ${bill.vendor.phone}</p>` : ''}
      ${bill.vendor.address ? `<p>${bill.vendor.address}</p>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr><th style="text-align:center;">S.No</th><th>Product</th><th>Barcode Range</th><th style="text-align:center;">Qty</th>${bill.groupedItems.some(g => g.discountPercent > 0) ? '<th style="text-align:right;">MRP</th><th style="text-align:right;">Disc%</th>' : ''}<th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${bill.groupedItems.map((g) => `
      <tr>
        <td style="text-align:center;">${g.sno}</td>
        <td><strong>${g.productName}</strong></td>
        <td style="font-family:monospace;font-size:12px;">${g.barcodeRange}</td>
        <td style="text-align:center;">${g.quantity}</td>
        ${bill.groupedItems.some(gi => gi.discountPercent > 0) ? `<td style="text-align:right;">₹${g.originalPrice.toLocaleString()}</td><td style="text-align:right;color:#16a34a;">${g.discountPercent > 0 ? g.discountPercent + '%' : '-'}</td>` : ''}
        <td style="text-align:right;">₹${g.netPrice.toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold;">₹${g.lineTotal.toLocaleString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="summary" style="flex-wrap:wrap;">
    <span>Total Quantity: <strong>${bill.totalQuantity} units</strong></span>
    ${bill.totalDiscount > 0 ? `<span>Gross: <strong>₹${bill.grossValue.toLocaleString()}</strong></span><span>Discount: <strong style="color:#16a34a;">-₹${bill.totalDiscount.toLocaleString()}</strong></span>` : ''}
    <span>Net Amount: <strong style="color:#F27D26;font-size:16px;">₹${bill.totalValue.toLocaleString()}</strong></span>
  </div>
  ${bill.payment ? `
  <div style="margin-top:16px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
    <strong style="font-size:13px;">Payment Summary</strong>
    <table style="width:100%;margin-top:8px;font-size:13px;">
      <tr><td style="color:#6b7280;padding:3px 0;">Total Distributed Value (All Time)</td><td style="text-align:right;font-weight:600;">₹${bill.payment.totalDistributedValue.toLocaleString()}</td></tr>
      <tr><td style="color:#16a34a;padding:3px 0;">Amount Paid</td><td style="text-align:right;font-weight:600;color:#16a34a;">₹${bill.payment.totalPaid.toLocaleString()}</td></tr>
      <tr style="border-top:2px solid #F27D26;"><td style="padding:6px 0;font-weight:700;${bill.payment.balance > 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">Balance Remaining</td><td style="text-align:right;font-weight:700;font-size:15px;${bill.payment.balance > 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">₹${bill.payment.balance.toLocaleString()}</td></tr>
    </table>
  </div>` : ''}
  ${bill.payment && bill.payment.balance <= 0 ? `<div style="text-align:center;margin-top:16px;"><span style="display:inline-block;padding:8px 32px;border:3px solid #16a34a;color:#16a34a;font-size:24px;font-weight:900;letter-spacing:6px;text-transform:uppercase;border-radius:8px;transform:rotate(-3deg);opacity:0.7;">PAID</span></div>` : ''}
  <div class="signatures">
    <div class="sig-box"><p>Authorized Signatory</p></div>
    <div class="sig-box"><p>Received By</p></div>
  </div>
  <div class="footer">
    <p>This is a computer-generated challan. Products listed above have been dispatched as described.</p>
  </div>
</body></html>`;
}
