/**
 * Minimal dBase III/IV / FoxPro DBF reader (Miracle Accounting).
 * Supports C/N/F/D/L/M; memo text via sibling .FPT when present.
 */
import fs from 'fs';
import path from 'path';

export type DbfValue = string | number | boolean | Date | null;
export type DbfRecord = Record<string, DbfValue>;

export interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}

function findPath(dir: string, base: string): string | null {
  const direct = path.join(dir, base);
  if (fs.existsSync(direct)) return direct;
  const lower = path.join(dir, base.toLowerCase());
  if (fs.existsSync(lower)) return lower;
  const upper = path.join(dir, base.toUpperCase());
  if (fs.existsSync(upper)) return upper;
  try {
    const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === base.toLowerCase());
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

function readFptMemos(fptPath: string): Map<number, string> {
  const out = new Map<number, string>();
  const buf = fs.readFileSync(fptPath);
  if (buf.length < 512) return out;
  const blockSize = buf.readUInt16BE(6) || 64;
  let block = 1;
  while (block * blockSize + 8 <= buf.length) {
    const offset = block * blockSize;
    const marker = buf.readInt32BE(offset);
    const size = buf.readUInt32BE(offset + 4);
    if (marker === 1 && size > 0 && offset + 8 + size <= buf.length) {
      const raw = buf.subarray(offset + 8, offset + 8 + size);
      // FoxPro memos are often null-terminated or padded
      let end = raw.length;
      while (end > 0 && (raw[end - 1] === 0 || raw[end - 1] === 0x1a)) end--;
      out.set(block, raw.subarray(0, end).toString('latin1'));
      block += Math.max(1, Math.ceil((8 + size) / blockSize));
    } else {
      block += 1;
    }
  }
  return out;
}

export function readDbf(filePath: string): { fields: DbfField[]; records: DbfRecord[] } {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 32) throw new Error(`DBF too small: ${filePath}`);

  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const numRecords = buf.readUInt32LE(4);
  if (headerLen < 33 || recordLen < 1) throw new Error(`Invalid DBF header: ${filePath}`);

  const fields: DbfField[] = [];
  for (let offset = 32; offset + 32 <= headerLen - 1; offset += 32) {
    if (buf[offset] === 0x0d) break;
    const nameBytes = buf.subarray(offset, offset + 11);
    const nameEnd = nameBytes.indexOf(0);
    const name = nameBytes
      .subarray(0, nameEnd >= 0 ? nameEnd : 11)
      .toString('ascii')
      .trim();
    if (!name) break;
    fields.push({
      name,
      type: String.fromCharCode(buf[offset + 11]),
      length: buf[offset + 16],
      decimals: buf[offset + 17],
    });
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const fpt = findPath(dir, `${base}.fpt`) || findPath(dir, `${base}.FPT`) || findPath(dir, `${base}.Fpt`);
  const memos = fpt ? readFptMemos(fpt) : new Map<number, string>();

  const records: DbfRecord[] = [];
  const dataStart = headerLen;
  // Some files include a 1-byte terminator already counted in headerLen
  if (buf[headerLen - 1] === 0x0d) {
    /* ok */
  }

  for (let i = 0; i < numRecords; i++) {
    const start = dataStart + i * recordLen;
    if (start + recordLen > buf.length) break;
    const deleted = buf[start] === 0x2a; // '*'
    if (deleted) continue;

    const row: DbfRecord = {};
    let pos = start + 1;
    for (const field of fields) {
      const raw = buf.subarray(pos, pos + field.length);
      pos += field.length;
      const text = raw.toString('latin1');
      switch (field.type) {
        case 'C':
          row[field.name] = text.replace(/\0/g, '').trim();
          break;
        case 'N':
        case 'F': {
          const n = text.trim();
          row[field.name] = n === '' ? null : parseDbfNumeric(n, field.decimals);
          break;
        }
        case 'D': {
          const d = text.trim();
          if (/^\d{8}$/.test(d)) {
            row[field.name] = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
          } else {
            row[field.name] = null;
          }
          break;
        }
        case 'L': {
          const c = text.trim().toUpperCase();
          row[field.name] = c === 'T' || c === 'Y' ? true : c === 'F' || c === 'N' ? false : null;
          break;
        }
        case 'M': {
          const blockNum = Number(text.trim());
          row[field.name] = Number.isFinite(blockNum) && blockNum > 0 ? (memos.get(blockNum) ?? null) : null;
          break;
        }
        default:
          row[field.name] = text.replace(/\0/g, '').trim();
      }
    }
    records.push(row);
  }

  return { fields, records };
}

export function findDbf(dir: string, name: string): string | null {
  return findPath(dir, name.endsWith('.dbf') || name.endsWith('.DBF') ? name : `${name}.dbf`);
}

export function str(v: DbfValue | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/**
 * Parse a DBF N/F field cell.
 * - If the ASCII already has a decimal point (or exponent), use Number(text) as-is.
 *   Never multiply/divide by field decimals — `100.00` stays 100, not 10000.
 * - If there is no decimal point and `decimals > 0`, treat digits as implied-decimal
 *   (Clipper/dBase): "100" with decimals=1 → 10.0 — avoids the classic “extra zero”.
 */
export function parseDbfNumeric(text: string, decimals: number): number | null {
  const t = text.replace(/\0/g, '').trim();
  if (!t || t === '+' || t === '-' || t === '.') return null;

  // Explicit decimal (Miracle usual form: "100.00", "3557000.0000") — never rescale.
  if (/[eE.]/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  if (!/^[+-]?\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  // Implied decimal only when the cell has no '.' — divide, never multiply.
  const d = Math.max(0, Math.min(8, Math.floor(Number(decimals) || 0)));
  return d > 0 ? n / 10 ** d : n;
}

/** INR money to paise precision (avoids float drift on import). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function num(v: DbfValue | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Like num(), then round to 2 decimals — use for voucher/invoice/payment amounts. */
export function money(v: DbfValue | undefined): number {
  return roundMoney(num(v));
}

/**
 * Line amount from qty × rate vs explicit amount.
 * When they disagree by exactly 10× (classic extra/missing zero), trust explicit.
 */
export function pickLineAmount(qty: number, rate: number, explicit: number): number {
  const product = roundMoney((Number(qty) || 0) * (Number(rate) || 0));
  const e = roundMoney(Number(explicit) || 0);
  if (e > 0 && product > 0) {
    const ratio = product / e;
    if (Math.abs(ratio - 10) < 0.001 || Math.abs(ratio - 0.1) < 0.001) return e;
  }
  if (e > 0) return e;
  return product;
}

export function dateStr(v: DbfValue | undefined): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
