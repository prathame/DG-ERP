/**
 * Miracle-style party account statement (Collections / invoice-finance).
 * Debit = sales (party owes us); Credit = receipts. Opening/closing pad the
 * shorter column so both sides total the same.
 */

export type PartyStatementLine = {
  date: string;
  particular: string;
  amount: number;
  billNo?: string | null;
  note?: string | null;
};

export type PartyStatementSide = 'debit' | 'credit' | 'nil';

export type PartyStatementModel = {
  companyName: string;
  partyName: string;
  partyPhone?: string | null;
  partyAddress?: string | null;
  from: string;
  to: string;
  /** Signed opening: + = debit (party owes), − = credit (advance / overpay). */
  openingSigned: number;
  debitLines: PartyStatementLine[];
  creditLines: PartyStatementLine[];
  closingSigned: number;
};

export type PartyStatementDisplay = PartyStatementModel & {
  opening: { amount: number; side: PartyStatementSide };
  closing: { amount: number; side: PartyStatementSide };
  debitColumn: Array<{ amount: number; label: string; date?: string; billNo?: string | null }>;
  creditColumn: Array<{ amount: number; label: string; date?: string; billNo?: string | null }>;
  debitTotal: number;
  creditTotal: number;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function signedToSide(signed: number): PartyStatementSide {
  if (Math.abs(signed) < 0.005) return 'nil';
  return signed > 0 ? 'debit' : 'credit';
}

/** Build display columns with opening/closing on the balancing sides (Miracle). */
export function buildPartyStatementDisplay(model: PartyStatementModel): PartyStatementDisplay {
  const openingSigned = round2(model.openingSigned);
  const sales = round2(model.debitLines.reduce((s, l) => s + l.amount, 0));
  const receipts = round2(model.creditLines.reduce((s, l) => s + l.amount, 0));
  const closingSigned = round2(openingSigned + sales - receipts);

  const opening = { amount: Math.abs(openingSigned), side: signedToSide(openingSigned) };
  const closing = { amount: Math.abs(closingSigned), side: signedToSide(closingSigned) };

  const debitColumn: PartyStatementDisplay['debitColumn'] = [];
  const creditColumn: PartyStatementDisplay['creditColumn'] = [];

  if (opening.side === 'debit') {
    debitColumn.push({ amount: opening.amount, label: 'DB Opening Balance' });
  } else if (opening.side === 'credit') {
    creditColumn.push({ amount: opening.amount, label: 'CR Opening Balance' });
  }

  for (const l of model.debitLines) {
    debitColumn.push({
      amount: round2(l.amount),
      label: l.particular || 'Sale',
      date: l.date,
      billNo: l.billNo,
    });
  }
  for (const l of model.creditLines) {
    creditColumn.push({
      amount: round2(l.amount),
      label: l.particular || 'CRct',
      date: l.date,
      billNo: l.billNo,
    });
  }

  if (closing.side === 'debit') {
    creditColumn.push({ amount: closing.amount, label: 'DB Closing Balance' });
  } else if (closing.side === 'credit') {
    debitColumn.push({ amount: closing.amount, label: 'CR Closing Balance' });
  }

  const debitTotal = round2(debitColumn.reduce((s, r) => s + r.amount, 0));
  const creditTotal = round2(creditColumn.reduce((s, r) => s + r.amount, 0));

  return {
    ...model,
    openingSigned,
    closingSigned,
    opening,
    closing,
    debitColumn,
    creditColumn,
    debitTotal,
    creditTotal,
  };
}

export function formatStatementDate(iso: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatStatementDateShort(iso: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
}

export function partyStatementFilename(
  partyName: string,
  phone: string | null | undefined,
  from: string,
  to: string,
): string {
  const name =
    String(partyName || 'Party')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 40) || 'Party';
  const ph = String(phone || '')
    .replace(/\D/g, '')
    .slice(0, 15);
  const mid = ph ? `${name}-${ph}` : name;
  return `${mid}_PartyStatement_${formatStatementDateShort(from)}_${formatStatementDateShort(to)}.PDF`;
}

function escHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moneyIn(n: number): string {
  return round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderColumnRows(rows: PartyStatementDisplay['debitColumn'], padTo: number): string {
  const cells: string[] = [];
  for (let i = 0; i < padTo; i++) {
    const r = rows[i];
    if (!r) {
      cells.push(`<tr><td class="amt"></td><td class="part"></td></tr>`);
      continue;
    }
    const dateBit = r.date ? ` ${escHtml(formatStatementDate(r.date))}` : '';
    const billBit = r.billNo ? `<div class="bill">Bill No<br/>${escHtml(r.billNo)}</div>` : '';
    cells.push(
      `<tr>
        <td class="amt">${moneyIn(r.amount)}</td>
        <td class="part">${escHtml(r.label)}${dateBit}${billBit}</td>
      </tr>`,
    );
  }
  return cells.join('');
}

/** Full printable HTML (Miracle dual-column party statement). */
export function renderPartyStatementHtml(display: PartyStatementDisplay): string {
  const pad = Math.max(display.debitColumn.length, display.creditColumn.length, 1);
  const phoneBit = display.partyPhone ? ` - ${escHtml(display.partyPhone)}` : '';
  const addrBit = display.partyAddress ? ` (${escHtml(display.partyAddress)})` : '';
  const title = `Account Statement For ${escHtml(display.partyName)}${phoneBit}${addrBit}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; color: #111; margin: 0; padding: 8px 12px; font-size: 12px; }
  .company { text-align: center; font-size: 18px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 4px; }
  .title { text-align: center; font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .period { text-align: center; font-size: 12px; margin-bottom: 10px; }
  .page { text-align: right; font-size: 11px; margin-bottom: 4px; }
  table.cols { width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
  table.cols > thead > tr > th { border: 1px solid #111; padding: 6px 8px; font-size: 12px; font-weight: 700; }
  table.cols > tbody > tr > td { vertical-align: top; border: 1px solid #111; width: 50%; padding: 0; }
  table.inner { width: 100%; border-collapse: collapse; }
  table.inner td { border: none; border-bottom: 1px dotted #bbb; padding: 3px 6px; vertical-align: top; }
  table.inner tr:last-child td { border-bottom: none; }
  td.amt { width: 28%; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.part { width: 72%; }
  .bill { font-size: 10px; color: #333; margin-top: 2px; line-height: 1.25; }
  .totals td { border-top: 1.5px solid #111 !important; font-weight: 700; padding-top: 6px; padding-bottom: 6px; }
  .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #666; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="company">${escHtml(display.companyName)}</div>
  <div class="title">${title}</div>
  <div class="page">Page : 1</div>
  <div class="period">From ${escHtml(formatStatementDate(display.from))} To ${escHtml(formatStatementDate(display.to))}</div>
  <table class="cols">
    <thead>
      <tr>
        <th>Debit Particulars</th>
        <th>Credit Particulars</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <table class="inner">
            ${renderColumnRows(display.debitColumn, pad)}
            <tr class="totals"><td class="amt">${moneyIn(display.debitTotal)}</td><td class="part"></td></tr>
          </table>
        </td>
        <td>
          <table class="inner">
            ${renderColumnRows(display.creditColumn, pad)}
            <tr class="totals"><td class="amt">${moneyIn(display.creditTotal)}</td><td class="part"></td></tr>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div class="print-end avoid-break footer">Generated on ${escHtml(new Date().toLocaleDateString('en-IN'))} · ${escHtml(display.companyName)}</div>
</body></html>`;
}
