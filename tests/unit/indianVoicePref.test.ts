import { describe, expect, it } from 'vitest';
import {
  clampVoiceRate,
  isIndianVoice,
  listIndianVoices,
  pickIndianVoice,
  prepareVoiceUtterance,
  VOICE_RATE_DEFAULT,
} from '../../src/lib/indianVoicePref';

describe('indianVoicePref', () => {
  it('keeps en-IN / hi-IN voices and drops US English', () => {
    expect(isIndianVoice({ lang: 'en-IN', name: 'Google English (India)' })).toBe(true);
    expect(isIndianVoice({ lang: 'hi-IN', name: 'Google हिन्दी' })).toBe(true);
    expect(isIndianVoice({ lang: 'en-US', name: 'Google US English' })).toBe(false);
  });

  it('uses stored voice only when it matches the app language', () => {
    const voices = [
      { voiceURI: 'a', name: 'Heera', lang: 'en-IN' },
      { voiceURI: 'b', name: 'Hindi', lang: 'hi-IN' },
      { voiceURI: 'g', name: 'Google ગુજરાતી', lang: 'gu-IN' },
    ];
    expect(pickIndianVoice(voices, 'b', 'hi-IN')?.voiceURI).toBe('b');
    expect(pickIndianVoice(voices, 'b', 'en-IN')?.voiceURI).toBe('a');
    expect(pickIndianVoice(voices, '', 'hi-IN')?.lang).toBe('hi-IN');
    expect(pickIndianVoice(voices, '', 'gu-IN')?.voiceURI).toBe('g');
  });

  it('does not attach Telugu/Kannada when the app is Gujarati', () => {
    const voices = [
      { voiceURI: 'te', name: 'Geeta', lang: 'te-IN' },
      { voiceURI: 'hi', name: 'Lekha', lang: 'hi-IN' },
      { voiceURI: 'en', name: 'Rishi', lang: 'en-IN' },
    ];
    expect(pickIndianVoice(voices, '', 'gu-IN')).toBeNull();
  });

  it('picks Microsoft Dhwani as Gujarati on Windows', () => {
    const voices = [
      { voiceURI: 'heera', name: 'Microsoft Heera - English (India)', lang: 'en-IN' },
      { voiceURI: 'dhwani', name: 'Microsoft Dhwani Online (Natural) - Gujarati (India)', lang: 'gu-IN' },
      { voiceURI: 'kalpana', name: 'Microsoft Kalpana - Hindi (India)', lang: 'hi-IN' },
    ];
    expect(pickIndianVoice(voices, '', 'gu-IN')?.voiceURI).toBe('dhwani');
    const u = prepareVoiceUtterance('ધંધો. ફોર્મ ચેક કરો.', 'gu-IN', voices, '');
    expect(u.voiceURI).toBe('dhwani');
    expect(u.lang).toBe('gu-IN');
    expect(u.text).toBe('ધંધો. ફોર્મ ચેક કરો.');
  });

  it('keeps Gujarati text and gu-IN when no Gujarati voice is listed yet', () => {
    const voices = [
      { voiceURI: 'te', name: 'Geeta', lang: 'te-IN' },
      { voiceURI: 'hi', name: 'Microsoft Kalpana - Hindi (India)', lang: 'hi-IN' },
      { voiceURI: 'en', name: 'Microsoft Heera - English (India)', lang: 'en-IN' },
    ];
    const u = prepareVoiceUtterance('ધંધો. ફોર્મ ચેક કરો.', 'gu-IN', voices, '');
    expect(u.voiceURI).toBeNull();
    expect(u.lang).toBe('gu-IN');
    expect(u.text).toBe('ધંધો. ફોર્મ ચેક કરો.');
  });

  it('uses a real Gujarati voice when Chrome lists one', () => {
    const voices = [
      { voiceURI: 'hi', name: 'Google हिन्दी', lang: 'hi-IN' },
      { voiceURI: 'g', name: 'Google ગુજરાતી', lang: 'gu-IN' },
    ];
    const u = prepareVoiceUtterance('ધંધો. ફોર્મ ચેક કરો.', 'gu-IN', voices, '');
    expect(u.voiceURI).toBe('g');
    expect(u.lang).toBe('gu-IN');
    expect(u.text).toBe('ધંધો. ફોર્મ ચેક કરો.');
  });

  it('matches Chrome Google Gujarati when lang is gu without a region', () => {
    const voices = [
      { voiceURI: 'hi', name: 'Google हिन्दी', lang: 'hi-IN' },
      { voiceURI: 'g', name: 'Google ગુજરાતી', lang: 'gu' },
    ];
    expect(pickIndianVoice(voices, '', 'gu-IN')?.voiceURI).toBe('g');
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
