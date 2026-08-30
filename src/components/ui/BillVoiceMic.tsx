import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { speechLangTag, type BillVoiceLang } from '../../lib/billVoice';

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

export function BillVoiceMic({
  lang,
  disabled,
  onHeard,
}: {
  lang: BillVoiceLang;
  disabled?: boolean;
  onHeard: (transcript: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
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
      aria-label={listening ? 'Stop listening' : 'Fill this bill by voice'}
      className={cn(
        'shrink-0 min-h-11 px-3 inline-flex items-center gap-1.5 rounded-xl border text-sm font-semibold',
        listening
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {listening ? <Square size={14} /> : <Mic size={16} />}
      {listening ? 'Listening…' : 'Speak'}
    </button>
  );
}
