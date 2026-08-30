import { describe, expect, it } from 'vitest';
import {
  clampVoiceRate,
  isIndianVoice,
  listIndianVoices,
  pickIndianVoice,
  VOICE_RATE_DEFAULT,
} from '../../src/lib/indianVoicePref';

describe('indianVoicePref', () => {
  it('keeps en-IN / hi-IN voices and drops US English', () => {
    expect(isIndianVoice({ lang: 'en-IN', name: 'Google English (India)' })).toBe(true);
    expect(isIndianVoice({ lang: 'hi-IN', name: 'Google हिन्दी' })).toBe(true);
    expect(isIndianVoice({ lang: 'en-US', name: 'Google US English' })).toBe(false);
  });

  it('picks the stored Indian voice over auto', () => {
    const voices = [
      { voiceURI: 'a', name: 'Heera', lang: 'en-IN' },
      { voiceURI: 'b', name: 'Hindi', lang: 'hi-IN' },
    ];
    expect(pickIndianVoice(voices, 'b', 'en-IN')?.voiceURI).toBe('b');
    expect(pickIndianVoice(voices, '', 'hi-IN')?.lang).toBe('hi-IN');
  });

  it('lists only Indian voices', () => {
    expect(
      listIndianVoices([
        { voiceURI: 'us', name: 'Samantha', lang: 'en-US' },
        { voiceURI: 'in', name: 'Ravi', lang: 'en-IN' },
      ]).map(v => v.voiceURI),
    ).toEqual(['in']);
  });

  it('clamps speech rate to a usable range', () => {
    expect(clampVoiceRate(1)).toBe(VOICE_RATE_DEFAULT);
    expect(clampVoiceRate(0.2)).toBe(0.6);
    expect(clampVoiceRate(3)).toBe(1.4);
    expect(clampVoiceRate(1.2)).toBe(1.2);
    expect(clampVoiceRate('nope')).toBe(1);
    expect(clampVoiceRate(null)).toBe(1);
  });
});
