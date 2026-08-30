import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  getStoredVoiceRate,
  getStoredVoiceUri,
  listIndianVoices,
  setStoredVoiceRate,
  setStoredVoiceUri,
  type SpeechVoiceInfo,
} from '../../lib/indianVoicePref';
import { speakBillVoice } from '../../components/ui/BillVoiceMic';
import { formControlClass } from '../../components/ui';
import { cn } from '../../lib/utils';

function readVoices(): SpeechVoiceInfo[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return listIndianVoices(
    window.speechSynthesis.getVoices().map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang })),
  );
}

export function IndianVoiceSelect() {
  const { t, lang } = useTranslation();
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>(readVoices);
  const [uri, setUri] = useState(getStoredVoiceUri);
  const [rate, setRate] = useState(getStoredVoiceRate);

  useEffect(() => {
    const sync = () => setVoices(readVoices());
    sync();
    window.speechSynthesis?.addEventListener('voiceschanged', sync);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', sync);
  }, []);

  const preview = () => speakBillVoice(t('settings.voicePreviewSample'), lang);

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-sm">{t('settings.voice')}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t('settings.voiceDesc')}</p>
      </div>
      {voices.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t('settings.voiceNone')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('settings.voice')}
            className={cn(formControlClass, 'flex-1 min-w-[12rem]')}
            value={uri}
            onChange={e => {
              setUri(e.target.value);
              setStoredVoiceUri(e.target.value);
            }}
          >
            <option value="">{t('settings.voiceAuto')}</option>
            {voices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={preview}
            className="shrink-0 min-h-11 px-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('settings.voicePreview')}
          </button>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm">{t('settings.voiceSpeed')}</p>
          <span className="text-xs font-semibold text-gray-500">
            {rate <= 0.8
              ? t('settings.voiceSpeedSlow')
              : rate >= 1.2
                ? t('settings.voiceSpeedFast')
                : t('settings.voiceSpeedNormal')}{' '}
            · {rate.toFixed(1)}×
          </span>
        </div>
        <input
          type="range"
          min={0.6}
          max={1.4}
          step={0.1}
          value={rate}
          aria-label={t('settings.voiceSpeed')}
          onChange={e => {
            const next = Number(e.target.value);
            setRate(next);
            setStoredVoiceRate(next);
          }}
          className="w-full mt-2 accent-[var(--color-brand,#ea580c)]"
        />
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">
          <span>{t('settings.voiceSpeedSlow')}</span>
          <span>{t('settings.voiceSpeedNormal')}</span>
          <span>{t('settings.voiceSpeedFast')}</span>
        </div>
      </div>
    </div>
  );
}
