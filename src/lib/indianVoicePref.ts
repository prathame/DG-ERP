/** Per-device Indian TTS voice and speech rate. Browsers only expose OS-installed voices. */

export const VOICE_PREF_KEY = 'dhandho_voice_uri';
export const VOICE_RATE_KEY = 'dhandho_voice_rate';
export const VOICE_RATE_MIN = 0.6;
export const VOICE_RATE_MAX = 1.4;
export const VOICE_RATE_DEFAULT = 1;

/** Per-device: show Speak / mic icons. Off until the owner turns it on in Settings. */
export const VOICE_ASSIST_KEY = 'dhandho_voice_assist';
export const VOICE_ASSIST_CHANGED_EVENT = 'dhandho-voice-assist-changed';

export function getVoiceAssistEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_ASSIST_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVoiceAssistEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(VOICE_ASSIST_KEY, '1');
    else localStorage.removeItem(VOICE_ASSIST_KEY);
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VOICE_ASSIST_CHANGED_EVENT, { detail: { enabled: on } }));
  }
}

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
  return /india|hindi|हिन्द|gujarati|ગુજરાત|dhwani|marathi|मराठी|english \(india\)/i.test(String(v.name || ''));
}

/** True when this voice can actually speak the app language (not merely any Indian voice). */
export function voiceLangMatches(v: { lang?: string; name?: string }, appLangTag: string): boolean {
  const prefix = appLangTag.slice(0, 2).toLowerCase();
  const lang = String(v.lang || '')
    .replace('_', '-')
    .toLowerCase();
  if (lang === prefix || lang.startsWith(`${prefix}-`)) return true;
  const name = String(v.name || '');
  if (prefix === 'gu') return /gujarati|ગુજરાતી|dhwani/i.test(name);
  if (prefix === 'hi') return /hindi|हिन्द|kalpana/i.test(name);
  if (prefix === 'mr') return /marathi|मराठी/i.test(name);
  return false;
}

export function listIndianVoices(voices: SpeechVoiceInfo[]): SpeechVoiceInfo[] {
  return voices.filter(isIndianVoice).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Stored pick when it matches the app language, else a matching Indian voice. Never a random other Indian language. */
export function pickIndianVoice(
  voices: SpeechVoiceInfo[],
  storedUri: string,
  appLangTag: string,
): SpeechVoiceInfo | null {
  const indian = listIndianVoices(voices);
  if (!indian.length) return null;
  if (storedUri) {
    const hit = indian.find(v => v.voiceURI === storedUri);
    if (hit && voiceLangMatches(hit, appLangTag)) return hit;
  }
  return indian.find(v => voiceLangMatches(v, appLangTag)) || null;
}

export type PreparedUtterance = { text: string; lang: string; voiceURI: string | null };

/**
 * Bind a matching Indian voice (Google ગુજરાતી in Chrome, Microsoft Dhwani on Windows).
 * If none is listed yet, leave voice unset and keep gu-IN / hi-IN / … so Chrome can still
 * speak that language. Never attach Hindi/Telugu/English for Gujarati — that makes it silent or Hindi.
 */
export function prepareVoiceUtterance(
  text: string,
  appLangTag: string,
  voices: SpeechVoiceInfo[],
  storedUri: string,
): PreparedUtterance {
  const picked = pickIndianVoice(voices, storedUri, appLangTag);
  if (picked) return { text, lang: appLangTag, voiceURI: picked.voiceURI };
  return { text, lang: appLangTag, voiceURI: null };
}
