import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Monitor, ExternalLink, Smartphone, Cloud, Loader } from 'lucide-react';

type DownloadLinks = {
  serviceCloudAppUrl: string | null;
  serviceMobileAppUrl: string | null;
  desktopAppUrl: string | null;
};

function DownloadButton({ href, label, accent }: { href: string; label: string; accent: 'sky' | 'emerald' | 'brand' }) {
  const ring =
    accent === 'sky'
      ? 'border-sky-500/30 hover:border-sky-400/60 hover:bg-sky-500/10'
      : accent === 'emerald'
        ? 'border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/10'
        : 'border-brand/30 hover:border-brand/60 hover:bg-brand/10';
  const icon = accent === 'sky' ? 'text-sky-300' : accent === 'emerald' ? 'text-emerald-400' : 'text-brand';
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
            Testing builds — one stable URL each. No versioned releases.
          </p>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader size={32} className="animate-spin text-brand" />
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            <p className="text-xs font-bold uppercase tracking-widest text-white/35 px-1">Service businesses</p>
            <p className="text-sm text-white/45 -mt-3 px-1">
              Two different products — do <strong className="text-white/70">not</strong> mix installers or licenses.
            </p>

            {/* Service Cloud — ONLINE */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-sky-500/25 bg-sky-500/5 overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Cloud size={18} className="text-sky-400 shrink-0" />
                  <span className="font-bold text-base sm:text-lg">Dhando Service Cloud</span>
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-bold">
                    ONLINE
                  </span>
                </div>
                <p className="text-sm text-white/45">
                  Cloud seats for service tenants. Needs internet. One live session company-wide.
                </p>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-3">
                {links?.serviceCloudAppUrl ? (
                  <DownloadButton href={links.serviceCloudAppUrl} label="Download Service Cloud app" accent="sky" />
                ) : (
                  <p className="text-sm text-white/40">
                    Download URL not set yet. Super Admin → Analytics → paste one evergreen link (rebuilds overwrite the
                    same file).
                  </p>
                )}
                <p className="text-xs text-white/40">
                  SA seats panel on the service tenant — not a{' '}
                  <span className="font-mono text-emerald-400/70">DG-SM-</span> license.
                </p>
              </div>
            </motion.div>

            {/* Service Mobile — OFFLINE */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Smartphone size={18} className="text-emerald-400 shrink-0" />
                  <span className="font-bold text-base sm:text-lg">Dhando Service Mobile</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                    OFFLINE
                  </span>
                </div>
                <p className="text-sm text-white/45">
                  Phone-only offline ERP. Separate from Service Cloud seats above.
                </p>
              </div>
              <div className="px-4 sm:px-6 py-4 space-y-3">
                {links?.serviceMobileAppUrl ? (
                  <DownloadButton
                    href={links.serviceMobileAppUrl}
                    label="Download Service Mobile (offline) app"
                    accent="emerald"
                  />
                ) : (
                  <p className="text-sm text-white/40">
                    Download URL not set yet. Super Admin → Analytics → paste one evergreen link for the offline APK.
                  </p>
                )}
                <p className="text-xs text-white/40">
                  Requires a <span className="font-mono text-emerald-400/80">DG-SM-…</span> license. Do not use for
                  online cloud seats.
                </p>
              </div>
            </motion.div>

            {/* Optional single desktop URL */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Monitor size={18} className="text-brand" />
                  <span className="font-bold text-lg">Desktop app</span>
                  <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full font-bold">
                    OPTIONAL
                  </span>
                </div>
                <p className="text-sm text-white/40">
                  One desktop installer URL for testing (Cloud Electron / On-Prem).
                </p>
              </div>
              <div className="px-6 py-4">
                {links?.desktopAppUrl ? (
                  <DownloadButton href={links.desktopAppUrl} label="Download desktop app" accent="brand" />
                ) : (
                  <p className="text-sm text-white/40">Optional — set when you have a desktop build to share.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
