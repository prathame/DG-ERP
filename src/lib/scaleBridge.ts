/**
 * Weighing-scale capture for jewellery / metal intake.
 * Web Serial (Chrome/Edge) with optional persistent connect, keyboard-wedge paste, manual entry.
 */

export type ScaleReading = {
  weight: number;
  unit: 'g' | 'kg' | 'unknown';
  raw: string;
  source: 'serial' | 'wedge' | 'manual';
};

export type ScaleConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reading' | 'error';

export type ScaleConnectionState = {
  status: ScaleConnectionStatus;
  /** User-facing detail when status is error (or last failure). */
  message?: string;
  lastWeightG?: number;
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

async function readParsedWeightFromPort(port: SerialPortLike, timeoutMs: number): Promise<ScaleReading> {
  if (!port.readable) {
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
    throw new Error('No weight reading from scale. Check cable/power or enter weight manually.');
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Persistent serial session — Connect once, Read many times, Disconnect when done.
 * Status is for the Metal Intake UI chip.
 */
export class ScaleSession {
  private port: SerialPortLike | null = null;
  private status: ScaleConnectionStatus = 'disconnected';
  private message?: string;
  private lastWeightG?: number;
  private listeners = new Set<(s: ScaleConnectionState) => void>();

  getState(): ScaleConnectionState {
    return { status: this.status, message: this.message, lastWeightG: this.lastWeightG };
  }

  subscribe(listener: (s: ScaleConnectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: ScaleConnectionStatus, message?: string) {
    this.status = status;
    this.message = message;
    const snap = this.getState();
    for (const l of this.listeners) l(snap);
  }

  isConnected(): boolean {
    return this.port != null && (this.status === 'connected' || this.status === 'reading');
  }

  async connect(opts?: { baudRate?: number }): Promise<void> {
    if (!isWebSerialSupported()) {
      this.emit('error', 'Web Serial needs Chrome/Edge on HTTPS (or localhost).');
      throw new Error(this.message);
    }
    if (this.port) {
      this.emit('connected');
      return;
    }
    this.emit('connecting', 'Select the scale in the browser…');
    try {
      const nav = navigator as Navigator & {
        serial: { requestPort: () => Promise<SerialPortLike> };
      };
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: opts?.baudRate ?? 9600 });
      this.port = port;
      this.emit('connected', 'Scale connected');
    } catch (err) {
      this.port = null;
      const msg =
        err instanceof Error && err.name === 'NotFoundError'
          ? 'No scale selected'
          : err instanceof Error
            ? err.message
            : 'Could not connect to scale';
      this.emit('error', msg);
      throw new Error(msg);
    }
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (port) {
      try {
        await port.close();
      } catch {
        /* ignore */
      }
    }
    this.emit('disconnected', 'Scale disconnected');
  }

  async readWeight(opts?: { timeoutMs?: number }): Promise<ScaleReading> {
    if (!this.port) {
      // One-shot: connect → read → leave connected so status stays useful
      await this.connect();
    }
    if (!this.port) throw new Error('Scale not connected');
    this.emit('reading', 'Waiting for weight…');
    try {
      const reading = await readParsedWeightFromPort(this.port, opts?.timeoutMs ?? 8000);
      this.lastWeightG = reading.weight;
      this.emit('connected', `Last reading: ${reading.weight} g`);
      return reading;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scale read failed';
      // Keep port open on timeout so user can retry without re-picking the device
      this.emit(this.port ? 'error' : 'disconnected', msg);
      throw new Error(msg);
    }
  }
}

/**
 * Open a serial port and read until a weight line is parsed or timeout (one-shot).
 * Prefer {@link ScaleSession} when the UI shows connect status.
 */
export async function readWeightFromSerial(opts?: { baudRate?: number; timeoutMs?: number }): Promise<ScaleReading> {
  const session = new ScaleSession();
  try {
    await session.connect({ baudRate: opts?.baudRate });
    return await session.readWeight({ timeoutMs: opts?.timeoutMs });
  } finally {
    await session.disconnect();
  }
}
