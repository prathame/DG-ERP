import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../i18n';
import {
  ACCOUNTANT_GUIDE_IDS,
  SHOP_GUIDE_IDS,
  filterGuideTopics,
  resolveGuideTopics,
  type UserGuideTopic,
} from './userGuideContent';
import { isMiracleBooksFamilyVisible, isTabVisibleForUser, type TabConfig } from '../../../shared/tabPresets';
import { getTabVisiblePref, TAB_VISIBLE_PREF_CHANGED_EVENT } from '../../lib/tabVisibilityPrefs';
import { getChatbotPref, CHATBOT_PREF_CHANGED_EVENT } from '../../lib/chatbotPref';

function TopicCard({ topic, tapLabel }: { topic: UserGuideTopic; tapLabel: string }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white open:pb-1">
      <summary className="cursor-pointer list-none px-3.5 py-3 text-sm font-bold text-gray-900 flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{topic.title}</span>
        <span className="text-xs font-bold text-gray-400 shrink-0">{tapLabel}</span>
      </summary>
      <ol className="px-3.5 pb-3 space-y-1.5 list-decimal list-inside text-sm text-gray-600 leading-relaxed">
        {topic.steps.map((step, idx) => (
          <li key={`${topic.id}-${idx}`}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

export function UserGuidePanel({ tabConfig, isAdmin }: { tabConfig: TabConfig; isAdmin: boolean }) {
  const { t: st, dict } = useTranslation();
  const [audience, setAudience] = useState<'shop' | 'accountant'>('shop');
  const [prefsTick, setPrefsTick] = useState(0);

  useEffect(() => {
    const bump = () => setPrefsTick(n => n + 1);
    window.addEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, bump);
    window.addEventListener(CHATBOT_PREF_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(TAB_VISIBLE_PREF_CHANGED_EVENT, bump);
      window.removeEventListener(CHATBOT_PREF_CHANGED_EVENT, bump);
    };
  }, []);

  const pack = dict.userGuide;
  const { shopTopics, accTopics, chatbotOn } = useMemo(() => {
    const booksOn = isMiracleBooksFamilyVisible(tabConfig) && getTabVisiblePref('books');
    const tabOn = (tabId: string) => isTabVisibleForUser(tabId, tabConfig, getTabVisiblePref(tabId));
    const gate = { tabOn, booksOn, isAdmin };
    return {
      shopTopics: filterGuideTopics(resolveGuideTopics(pack.shop, SHOP_GUIDE_IDS), gate),
      accTopics: filterGuideTopics(resolveGuideTopics(pack.accountant, ACCOUNTANT_GUIDE_IDS), gate),
      chatbotOn: tabConfig.chatbot?.visible !== false && getChatbotPref(),
    };
  }, [prefsTick, tabConfig, isAdmin, pack]);
  const showShop = shopTopics.length > 0;
  const showAcc = accTopics.length > 0;
  const active: 'shop' | 'accountant' =
    audience === 'shop' && !showShop && showAcc
      ? 'accountant'
      : audience === 'accountant' && !showAcc && showShop
        ? 'shop'
        : audience;
  const intro = active === 'shop' ? pack.shopIntro : pack.accIntro;
  const topics = active === 'shop' ? shopTopics : accTopics;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <p className="text-sm text-gray-500 leading-relaxed">{st('settings.howToGuideLead')}</p>
      {showShop && showAcc ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAudience('shop')}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-bold border',
              active === 'shop'
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
              active === 'accountant'
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
            )}
          >
            {st('settings.howToAccountant')}
          </button>
        </div>
      ) : null}
      {topics.length === 0 ? (
        <p className="text-sm text-gray-600 leading-relaxed">{st('settings.howToGuideEmpty')}</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 leading-relaxed">{intro}</p>
          <div className="space-y-2">
            {topics.map(topic => (
              <React.Fragment key={topic.id}>
                <TopicCard topic={topic} tapLabel={pack.tap} />
              </React.Fragment>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-gray-400 leading-relaxed">
        {chatbotOn ? st('settings.howToGuideFooter') : st('settings.howToGuideFooterNoChat')}
      </p>
    </div>
  );
}
