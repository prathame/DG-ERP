import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isNativeCapacitor } from '../../lib/dhandhoFiles';
import { isPwaStandalone } from '../../lib/deviceId';
import { cn } from '../../lib/utils';

const DISMISS_KEY = 'dg_pwa_install_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua);
  const criOS = /CriOS/i.test(ua);
  const fxIOS = /FxiOS/i.test(ua);
  // Add to Home Screen works reliably from Safari (not Chrome/Firefox on iOS).
  return iOS && webkit && !criOS && !fxIOS;
}

function isElectronShell(): boolean {
  try {
    const ea = (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI;
    return Boolean(ea?.isElectron);
  } catch {
    return false;
  }
}

/**
 * Helps install the cloud ERP as a home-screen app (iPhone Safari + Android Chrome).
 * Hidden in Cap/Electron and when already running as installed PWA.
 */
export function PwaInstallPrompt({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isNativeCapacitor() || isElectronShell() || isPwaStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const installAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-0 z-[120] px-3',
        'bottom-[max(0.75rem,calc(0.5rem+var(--safe-bottom,0px)))]',
        className,
      )}
      role="dialog"
      aria-label="Install app"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-4 dark:border-white/10 dark:bg-[#1a1c1e]">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center">
            <Download size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Install Dhandho</p>
            {showIos ? (
              <p className="text-xs text-gray-500 dark:text-white/55 mt-1 leading-relaxed">
                On iPhone: tap <Share size={12} className="inline -mt-0.5" aria-hidden /> Share, then{' '}
                <span className="font-semibold text-gray-700 dark:text-white/80">Add to Home Screen</span>. Opens like
                an app — no App Store needed.
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-white/55 mt-1 leading-relaxed">
                Add to your home screen for faster access and a full-screen app experience.
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              {!showIos && deferred ? (
                <button
                  type="button"
                  onClick={() => void installAndroid()}
                  className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold"
                >
                  Install
                </button>
              ) : null}
              <button
                type="button"
                onClick={dismiss}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-white/50 dark:hover:bg-white/5"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
