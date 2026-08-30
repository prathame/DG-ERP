import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  speechLangTag,
  type BillVoiceLang,
  voiceSearchQuery,
  formatVoiceSearchReply,
  formatVoiceGuideEmpty,
  formatVoiceGuideConfirm,
  formatVoiceGuideDone,
  formatVoiceGuideRequired,
  isVoiceGuideSkip,
} from '../../lib/billVoice';
import { getStoredVoiceRate, getStoredVoiceUri, prepareVoiceUtterance } from '../../lib/indianVoicePref';
import { useConfirm } from '../../hooks/useConfirm';

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

export function speakBillVoice(text: string, lang: BillVoiceLang): Promise<void> {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve();
  stopSpeaking();
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
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
      u.onend = done;
      u.onerror = done;
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
  });
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

export type VoiceGuideField = {
  key: string;
  label: string;
  ask: string;
  parse: (transcript: string) => string;
  optional?: boolean;
};

/** Ask one field, listen, confirm, then the next. Does not save. */
export function VoiceFormGuide({
  lang,
  disabled,
  fields,
  onField,
  onDone,
}: {
  lang: BillVoiceLang;
  disabled?: boolean;
  fields: VoiceGuideField[];
  onField: (key: string, value: string) => void;
  onDone?: () => void;
}) {
  const { confirm, ConfirmRenderer } = useConfirm();
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState('');
  const recRef = useRef<SpeechRec | null>(null);
  const stepRef = useRef(0);
  const runningRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
      runningRef.current = false;
      stopSpeaking();
    };
  }, []);

  const Ctor = speechCtor();
  if (!Ctor) return null;

  const stopListen = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const startListen = () => {
    stopSpeaking();
    stopListen();
    const rec = new Ctor();
    rec.lang = speechLangTag(lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = ev => {
      const text = ev.results[0]?.[0]?.transcript?.trim();
      if (text) void applyHeard(text);
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

  const applyHeard = async (transcript: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const field = fields[stepRef.current];
    if (!field) {
      busyRef.current = false;
      return;
    }
    setHint(transcript);
    if (isVoiceGuideSkip(transcript)) {
      if (field.optional) {
        await goNext();
        return;
      }
      await speakBillVoice(formatVoiceGuideRequired(field.label, lang), lang);
      await speakBillVoice(field.ask, lang);
      busyRef.current = false;
      return;
    }
    const value = field.parse(transcript);
    if (!value) {
      if (field.optional) {
        await goNext();
        return;
      }
      await speakBillVoice(formatVoiceGuideEmpty(lang), lang);
      busyRef.current = false;
      return;
    }
    void speakBillVoice(formatVoiceGuideConfirm(field.label, value, lang), lang);
    const ok = await confirm({
      title: field.label,
      message: value,
      confirmLabel: 'Use this',
      cancelLabel: 'Speak again',
      variant: 'info',
    });
    if (!ok) {
      busyRef.current = false;
      return;
    }
    onField(field.key, value);
    await goNext();
  };

  const goNext = async () => {
    const next = stepRef.current + 1;
    if (next >= fields.length) {
      runningRef.current = false;
      stepRef.current = 0;
      setHint('');
      await speakBillVoice(formatVoiceGuideDone(lang), lang);
      onDone?.();
      busyRef.current = false;
      return;
    }
    stepRef.current = next;
    setHint(fields[next].ask);
    await speakBillVoice(fields[next].ask, lang);
    busyRef.current = false;
  };

  const onClick = () => {
    if (disabled || busyRef.current) return;
    if (listening) {
      stopListen();
      return;
    }
    if (!runningRef.current) {
      runningRef.current = true;
      stepRef.current = 0;
      const first = fields[0];
      if (!first) return;
      setHint(first.ask);
      void speakBillVoice(first.ask, lang).then(() => {
        if (runningRef.current) startListen();
      });
      return;
    }
    startListen();
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : 'Fill this form by voice'}
        className={cn(
          'shrink-0 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold px-3',
          listening
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        {listening ? <Square size={14} /> : <Mic size={16} />}
        {listening ? 'Listening…' : 'Speak'}
      </button>
      <span className="min-w-0 flex-1">{hint || 'I will ask each field. Say skip to leave optional ones blank.'}</span>
      {ConfirmRenderer}
    </>
  );
}
