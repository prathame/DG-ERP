/** Per-device Indian TTS voice and speech rate. Browsers only expose OS-installed voices. */

export const VOICE_PREF_KEY = 'dhandho_voice_uri';
export const VOICE_RATE_KEY = 'dhandho_voice_rate';
export const VOICE_RATE_MIN = 0.6;
export const VOICE_RATE_MAX = 1.4;
export const VOICE_RATE_DEFAULT = 1;

export type SpeechVoiceInfo = { voiceURI: string; name: string; lang: string };

export function getStoredVoiceUri(): string {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredVoiceUri(uri: string): void {
  try {
    if (uri) localStorage.setItem(VOICE_PREF_KEY, uri);
    else localStorage.removeItem(VOICE_PREF_KEY);
  } catch {
    /* private mode */
  }
}

export function clampVoiceRate(n: unknown): number {
  if (n == null || n === '') return VOICE_RATE_DEFAULT;
  const x = Number(n);
  if (!Number.isFinite(x)) return VOICE_RATE_DEFAULT;
  return Math.round(Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, x)) * 10) / 10;
}

export function getStoredVoiceRate(): number {
  try {
    return clampVoiceRate(localStorage.getItem(VOICE_RATE_KEY));
  } catch {
    return VOICE_RATE_DEFAULT;
  }
}

export function setStoredVoiceRate(rate: number): void {
  try {
    localStorage.setItem(VOICE_RATE_KEY, String(clampVoiceRate(rate)));
  } catch {
    /* private mode */
  }
}

export function isIndianVoice(v: { lang?: string; name?: string }): boolean {
  const lang = String(v.lang || '').replace('_', '-');
  if (/-IN$/i.test(lang)) return true;
  if (/^(hi|gu|mr|ta|te|kn|ml|bn|pa|or|as|ur)$/i.test(lang)) return true;
  return /india|hindi|हिन्द|ગુજરાત|मराठी|english \(india\)/i.test(String(v.name || ''));
}

export function listIndianVoices(voices: SpeechVoiceInfo[]): SpeechVoiceInfo[] {
  return voices.filter(isIndianVoice).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Stored pick, else a voice matching the app language, else first Indian voice. */
export function pickIndianVoice(
  voices: SpeechVoiceInfo[],
  storedUri: string,
  appLangTag: string,
): SpeechVoiceInfo | null {
  const indian = listIndianVoices(voices);
  if (!indian.length) return null;
  if (storedUri) {
    const hit = indian.find(v => v.voiceURI === storedUri);
    if (hit) return hit;
  }
  const prefix = appLangTag.slice(0, 2).toLowerCase();
  return indian.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(prefix)) || indian[0];
}
