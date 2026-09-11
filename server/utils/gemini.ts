/** Shared Gemini generateContent helpers (chat, bill scan, product scan, key test). */

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Last N conversation turns sent to Gemini (current user message is added separately). */
export const GEMINI_CHAT_HISTORY_TURNS = 4;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const SCAN_MAX_EDGE = 1280;
const SCAN_JPEG_QUALITY = 72;

export function geminiHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey };
}

/** Gemini 3 Flash thinks at medium by default; low cuts latency for chat/extraction. */
export function geminiGenerationConfig(opts: { temperature: number; maxOutputTokens: number }) {
  return {
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    thinkingConfig: { thinkingLevel: 'low' as const },
  };
}

export function buildAssistantContents(
  history: { role: string; text: string }[] | undefined,
  currentMessage: string,
): { role: string; parts: { text: string }[] }[] {
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const h of (history ?? []).slice(-GEMINI_CHAT_HISTORY_TURNS)) {
    const text = typeof h.text === 'string' ? h.text : '';
    if (!text) continue;
    if (h.role === 'user' && text === currentMessage) continue;
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: currentMessage }] });
  return contents;
}

/** Shrink photos/bills before inlineData. Non-images (PDF) pass through. */
export async function geminiInlineImage(buf: Buffer, mime: string): Promise<{ mimeType: string; data: string }> {
  const mimeType = mime || 'image/jpeg';
  if (!IMAGE_MIMES.has(mimeType.toLowerCase())) {
    return { mimeType, data: buf.toString('base64') };
  }
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(buf)
      .rotate()
      .resize(SCAN_MAX_EDGE, SCAN_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: SCAN_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { mimeType: 'image/jpeg', data: out.toString('base64') };
  } catch {
    return { mimeType, data: buf.toString('base64') };
  }
}
