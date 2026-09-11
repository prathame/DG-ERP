import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  GEMINI_GENERATE_URL,
  GEMINI_MODEL,
  buildAssistantContents,
  geminiGenerationConfig,
  geminiInlineImage,
} from '../../server/utils/gemini';

describe('geminiGenerationConfig', () => {
  it('sets thinkingLevel low', () => {
    expect(geminiGenerationConfig({ temperature: 0.7, maxOutputTokens: 512 })).toEqual({
      temperature: 0.7,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: 'low' },
    });
  });
});

describe('GEMINI_GENERATE_URL', () => {
  it('points at 3.5 flash-lite generateContent', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_GENERATE_URL).toContain('gemini-3.5-flash-lite:generateContent');
  });
});

describe('buildAssistantContents', () => {
  it('sends only the last 8 history turns plus current message', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: String(i),
    }));
    const contents = buildAssistantContents(history, 'now');
    expect(contents.map(c => c.parts[0].text)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', 'now']);
  });

  it('does not duplicate the current user message when it is already in history', () => {
    const contents = buildAssistantContents(
      [
        { role: 'user', text: 'hello' },
        { role: 'assistant', text: 'Hi' },
        { role: 'user', text: 'sales today' },
      ],
      'sales today',
    );
    expect(contents.filter(c => c.role === 'user' && c.parts[0].text === 'sales today')).toHaveLength(1);
    expect(contents.at(-1)?.parts[0].text).toBe('sales today');
  });
});

describe('geminiInlineImage', () => {
  it('downscales large photos to jpeg under the original size', async () => {
    const png = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 180, b: 40 } },
    })
      .png()
      .toBuffer();
    const inline = await geminiInlineImage(png, 'image/png');
    expect(inline.mimeType).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(inline.data, 'base64')).metadata();
    expect(meta.width).toBeLessThanOrEqual(1280);
    expect(meta.height).toBeLessThanOrEqual(1280);
    expect(Buffer.from(inline.data, 'base64').length).toBeLessThan(png.length);
  });

  it('passes PDFs through unchanged', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    const inline = await geminiInlineImage(pdf, 'application/pdf');
    expect(inline).toEqual({ mimeType: 'application/pdf', data: pdf.toString('base64') });
  });
});
