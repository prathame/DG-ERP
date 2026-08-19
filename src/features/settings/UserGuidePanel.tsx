import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';
import {
  ACCOUNTANT_GUIDE_INTRO,
  ACCOUNTANT_GUIDE_TOPICS,
  SHOP_GUIDE_INTRO,
  SHOP_GUIDE_TOPICS,
  type UserGuideTopic,
} from './userGuideContent';

function TopicCard({ topic }: { topic: UserGuideTopic }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white open:pb-1">
      <summary className="cursor-pointer list-none px-3.5 py-3 text-sm font-bold text-gray-900 flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{topic.title}</span>
        <span className="text-xs font-bold text-gray-400 shrink-0">Tap</span>
      </summary>
      <ol className="px-3.5 pb-3 space-y-1.5 list-decimal list-inside text-sm text-gray-600 leading-relaxed">
        {topic.steps.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

export function UserGuidePanel() {
  const { t: st } = useTranslation();
  const [audience, setAudience] = useState<'shop' | 'accountant'>('shop');
  const intro = audience === 'shop' ? SHOP_GUIDE_INTRO : ACCOUNTANT_GUIDE_INTRO;
  const topics = audience === 'shop' ? SHOP_GUIDE_TOPICS : ACCOUNTANT_GUIDE_TOPICS;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <p className="text-sm text-gray-500 leading-relaxed">{st('settings.howToGuideLead')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAudience('shop')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-bold border',
            audience === 'shop'
              ? 'bg-brand text-white border-brand'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
          )}
        >
          {st('settings.howToShop')}
        </button>
        <button
          type="button"
          onClick={() => setAudience('accountant')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-bold border',
            audience === 'accountant'
              ? 'bg-brand text-white border-brand'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
          )}
        >
          {st('settings.howToAccountant')}
        </button>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{intro}</p>
      <div className="space-y-2">
        {topics.map(topic => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{st('settings.howToGuideFooter')}</p>
    </div>
  );
}
