import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { speechLangTag, type BillVoiceLang, voiceSearchQuery, formatVoiceSearchReply } from '../../lib/billVoice';
import { getStoredVoiceRate, getStoredVoiceUri, prepareVoiceUtterance } from '../../lib/indianVoicePref';

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function billVoiceSupported(): boolean {
  return !!speechCtor();
}

function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function speakBillVoice(text: string, lang: BillVoiceLang) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
  stopSpeaking();
  const synth = window.speechSynthesis;
  const speakNow = () => {
    const voices = synth.getVoices().map(v => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
    }));
    const prepared = prepareVoiceUtterance(text, speechLangTag(lang), voices, getStoredVoiceUri());
    const u = new SpeechSynthesisUtterance(prepared.text);
    u.lang = prepared.lang;
    if (prepared.voiceURI) {
      const full = synth.getVoices().find(v => v.voiceURI === prepared.voiceURI);
      if (full) u.voice = full;
    }
    u.rate = getStoredVoiceRate();
    synth.speak(u);
  };
  if (synth.getVoices().length) {
    speakNow();
    return;
  }
  const once = () => {
    synth.removeEventListener('voiceschanged', once);
    speakNow();
  };
  synth.addEventListener('voiceschanged', once);
  window.setTimeout(() => {
    synth.removeEventListener('voiceschanged', once);
    if (!synth.speaking && !synth.pending) speakNow();
  }, 400);
}

export function BillVoiceMic({
  lang,
  disabled,
  onHeard,
  compact,
}: {
  lang: BillVoiceLang;
  disabled?: boolean;
  onHeard: (transcript: string) => void;
  compact?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
      stopSpeaking();
    };
  }, []);

  const Ctor = speechCtor();
  if (!Ctor) return null;

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const start = () => {
    stopSpeaking();
    const rec = new Ctor();
    rec.lang = speechLangTag(lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = ev => {
      const text = ev.results[0]?.[0]?.transcript?.trim();
      if (text) onHeard(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (listening ? stop() : start())}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : compact ? 'Search by voice' : 'Fill this form by voice'}
      className={cn(
        'shrink-0 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold',
        compact ? 'min-w-11 px-0' : 'px-3',
        listening
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {listening ? <Square size={14} /> : <Mic size={16} />}
      {compact ? null : listening ? 'Listening…' : 'Speak'}
    </button>
  );
}

export function VoiceSearchMic({
  lang,
  disabled,
  onQuery,
}: {
  lang: BillVoiceLang;
  onQuery: (query: string) => void;
  disabled?: boolean;
}) {
  return (
    <BillVoiceMic
      lang={lang}
      compact
      disabled={disabled}
      onHeard={transcript => {
        const q = voiceSearchQuery(transcript);
        if (!q) {
          speakBillVoice(formatVoiceSearchReply('', lang), lang);
          return;
        }
        onQuery(q);
        speakBillVoice(formatVoiceSearchReply(q, lang), lang);
      }}
    />
  );
}
