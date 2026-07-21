/**
 * Weighing-scale capture helper for jewellery / metal intake.
 * Supports Web Serial (Chrome) and keyboard-wedge paste; always allows manual entry.
 */

export type ScaleReading = {
  weight: number;
  unit: 'g' | 'kg' | 'unknown';
  raw: string;
  source: 'serial' | 'wedge' | 'manual';
};

/** Parse common scale text lines: "12.345 g", "W: 12.345g", "ST,GS,+  12.345g", etc. */
export function parseScaleText(raw: string): ScaleReading | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const m = text.match(/([-+]?\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams)?/i);
  if (!m) return null;
  let weight = parseFloat(m[1]);
  if (!Number.isFinite(weight)) return null;
  const unitRaw = (m[2] || 'g').toLowerCase();
  let unit: ScaleReading['unit'] = 'g';
  if (unitRaw === 'kg') {
    unit = 'kg';
    weight = weight * 1000;
  } else if (unitRaw.startsWith('g')) {
    unit = 'g';
  } else {
    unit = 'unknown';
  }
  // Normalize to grams in weight; unit reflects original when known
  return {
    weight: Math.round(weight * 1000) / 1000,
    unit: unit === 'kg' ? 'g' : unit,
    raw: text,
    source: 'wedge',
  };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

type SerialPortLike = {
  open: (opts: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  close: () => Promise<void>;
};

/**
 * Open a serial port and read until a weight line is parsed or timeout.
 * Requires a secure context (HTTPS or localhost) and user gesture for port picker.
 */
export async function readWeightFromSerial(opts?: { baudRate?: number; timeoutMs?: number }): Promise<ScaleReading> {
  if (!isWebSerialSupported()) {
    throw new Error('Web Serial is not supported in this browser. Enter weight manually.');
  }
  const nav = navigator as Navigator & {
    serial: { requestPort: () => Promise<SerialPortLike> };
  };
  const port = await nav.serial.requestPort();
  const baudRate = opts?.baudRate ?? 9600;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  await port.open({ baudRate });
  if (!port.readable) {
    await port.close().catch(() => undefined);
    throw new Error('Scale port is not readable');
  }
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(150, deadline - Date.now());
      const result = await Promise.race([
        reader.read(),
        new Promise<{ value?: Uint8Array; done: boolean }>(resolve =>
          setTimeout(() => resolve({ done: false, value: undefined }), remaining),
        ),
      ]);
      if (result.value && result.value.length) {
        buffer += decoder.decode(result.value, { stream: true });
      }
      const lines = buffer.split(/[\r\n]+/).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        const parsed = parseScaleText(lines[i]);
        if (parsed && parsed.weight > 0) {
          return { ...parsed, source: 'serial' };
        }
      }
      const parsedBuf = parseScaleText(buffer);
      if (parsedBuf && parsedBuf.weight > 0) {
        return { ...parsedBuf, source: 'serial' };
      }
      if (result.done) break;
    }
    throw new Error('No weight reading from scale. Check connection or enter weight manually.');
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await port.close();
    } catch {
      /* ignore */
    }
  }
}
