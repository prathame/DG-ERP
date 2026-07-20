import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Monitor, ExternalLink, Smartphone, Loader } from 'lucide-react';

type DownloadLinks = {
  serviceCloudAppUrl: string | null;
  serviceCloudIosUrl: string | null;
  serviceMobileAppUrl: string | null;
  serviceMobileIosUrl: string | null;
  desktopMacArm64Url: string | null;
  desktopMacX64Url: string | null;
  desktopWinUrl: string | null;
  desktopAppUrl: string | null;
};

function DownloadButton({ href, label, accent }: { href: string; label: string; accent: 'emerald' | 'brand' }) {
  const ring =
    accent === 'emerald'
      ? 'border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/10'
      : 'border-brand/30 hover:border-brand/60 hover:bg-brand/10';
  const icon = accent === 'emerald' ? 'text-emerald-400' : 'text-brand';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between p-4 rounded-xl border transition-all group ${ring}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Download size={18} className={`${icon} shrink-0`} />
        <div className="min-w-0">
          <div className="font-semibold text-sm">{label}</div>
          <div className="text-xs text-white/40 truncate">Same link every build — overwrite the file behind it</div>
        </div>
      </div>
      <ExternalLink size={14} className="text-white/35 group-hover:text-white/70 shrink-0" />
    </a>
  );
}

export function DownloadPage() {
  const [links, setLinks] = useState<DownloadLinks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/download-links')
      .then(r => (r.ok ? r.json() : null))
      .then((data: DownloadLinks | null) => setLinks(data))
      .catch(() => setLinks(null))
      .finally(() => setLoading(false));
  }, []);

  const androidUrl = links?.serviceMobileAppUrl || links?.serviceCloudAppUrl;
  const iosUrl = links?.serviceMobileIosUrl || links?.serviceCloudIosUrl;
  const macArm = links?.desktopMacArm64Url || links?.desktopAppUrl;
  const macX64 = links?.desktopMacX64Url;
  const winUrl = links?.desktopWinUrl;
  const hasDesktop = Boolean(macArm || macX64 || winUrl);

  return (
    <div className="min-h-[100dvh] bg-[#09090B] text-white">
      <nav
        className="fixed top-0 inset-x-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/40"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 min-w-0">
            <img
              src="/icons/logo-full.png"
              alt="Dhando"
              className="h-8 w-auto object-contain"
              style={{ filter: 'drop-shadow(0 0 8px rgba(242,125,38,0.3))' }}
            />
          </a>
          <a href="/" className="text-sm text-white/50 hover:text-white transition-colors shrink-0">
            ← Back
          </a>
        </div>
      </nav>

      <div
        className="max-w-3xl mx-auto px-4 pb-20"
        style={{
          paddingTop: 'calc(5.5rem + env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(5rem, calc(2rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10 sm:mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-bold mb-6">
            <Download size={12} /> Download Dhando
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 leading-tight">Get the App</h1>
          <p className="text-white/50 text-base sm:text-lg px-1">
            Phone and desktop each ship as one installer. At first launch, choose Online (cloud) or Offline — once.
          </p>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader size={32} className="animate-spin text-brand" />
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Smartphone size={18} className="text-emerald-400 shrink-0" />
                  <span className="font-bold text-base sm:text-lg">Dhando Service</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                    PHONE
                  </span>
                </div>
                <p className="text-sm text-white/45">
                  Online and Offline use different accounts and data. The app asks once; they never mix.
                </p>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-3">
                {androidUrl || iosUrl ? (
                  <>
                    {androidUrl && <DownloadButton href={androidUrl} label="Android APK" accent="emerald" />}
                    {iosUrl && <DownloadButton href={iosUrl} label="iOS (.app.zip)" accent="emerald" />}
                  </>
                ) : (
                  <p className="text-sm text-white/40">
                    Download URL not set yet. Super Admin → Analytics → paste evergreen links.
                  </p>
                )}
                <p className="text-xs text-white/40">
                  Offline mode needs a <span className="font-mono text-emerald-400/80">DG-SM-…</span> license. Online
                  mode uses company cloud seats. iOS is a simulator debug build (not App Store).
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Monitor size={18} className="text-brand" />
                  <span className="font-bold text-lg">Desktop</span>
                  <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full font-bold">
                    MAC + WINDOWS
                  </span>
                </div>
                <p className="text-sm text-white/40">
                  One app. First launch picks Online (cloud) or Offline (on this PC). Unsigned builds — Mac: right-click
                  → Open; Windows: SmartScreen may warn.
                </p>
              </div>
              <div className="px-6 py-4 space-y-3">
                {hasDesktop ? (
                  <>
                    {macArm && <DownloadButton href={macArm} label="Mac Apple Silicon (.dmg)" accent="brand" />}
                    {macX64 && <DownloadButton href={macX64} label="Mac Intel (.dmg)" accent="brand" />}
                    {winUrl && <DownloadButton href={winUrl} label="Windows x64 (.exe)" accent="brand" />}
                  </>
                ) : (
                  <p className="text-sm text-white/40">
                    Desktop URLs not set yet. Super Admin → Analytics → paste evergreen links.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
