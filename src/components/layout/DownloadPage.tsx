import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Monitor, Apple, ExternalLink, CheckCircle, Loader, Smartphone, Cloud } from 'lucide-react';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('https://api.github.com/repos/prathame/DG-ERP/releases/latest')
      .then(r => r.json())
      .then((data: Release) => {
        setRelease(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const arm64 = release?.assets.find(
    a => a.name.includes('arm64') && a.name.endsWith('.dmg') && a.name.includes('On-Prem'),
  );
  const intel = release?.assets.find(
    a => !a.name.includes('arm64') && a.name.endsWith('.dmg') && a.name.includes('On-Prem'),
  );
  const cloudArm = release?.assets.find(
    a => a.name.includes('arm64') && !a.name.includes('On-Prem') && a.name.endsWith('.dmg'),
  );
  const cloudIntel = release?.assets.find(
    a => !a.name.includes('arm64') && !a.name.includes('On-Prem') && a.name.endsWith('.dmg'),
  );

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img
              src="/icons/logo-full.png"
              alt="Dhando"
              className="h-8 w-auto object-contain"
              style={{ filter: 'drop-shadow(0 0 8px rgba(242,125,38,0.3))' }}
            />
          </a>
          <a href="/" className="text-sm text-white/50 hover:text-white transition-colors">
            ← Back to home
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 pt-28 pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-bold mb-6">
            <Download size={12} /> Download Dhando
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Get the App</h1>
          <p className="text-white/50 text-lg">
            {loading
              ? 'Fetching latest release...'
              : release
                ? `Version ${release.tag_name} · ${formatDate(release.published_at)}`
                : 'Apps for Dhandho — online and offline'}
          </p>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader size={32} className="animate-spin text-brand" />
          </div>
        )}

        {error && !release && (
          <div className="text-center py-10 text-white/40">
            <p>Could not fetch latest desktop release.</p>
            <a
              href="https://github.com/prathame/DG-ERP/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline mt-2 inline-flex items-center gap-1"
            >
              View on GitHub <ExternalLink size={14} />
            </a>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            <p className="text-xs font-bold uppercase tracking-widest text-white/35 px-1">Service businesses</p>
            <p className="text-sm text-white/45 -mt-3 px-1">
              Two different products — do <strong className="text-white/70">not</strong> mix installers or licenses.
            </p>

            {/* Service Cloud Seats — ONLINE */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-sky-500/25 bg-sky-500/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Cloud size={18} className="text-sky-400" />
                  <span className="font-bold text-lg">Dhando Service Cloud</span>
                  <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-bold">
                    ONLINE
                  </span>
                </div>
                <p className="text-sm text-white/45">
                  Cloud seats for service tenants. Needs internet. Phone and/or desktop. One live session company-wide.
                </p>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="space-y-2 text-sm text-white/60">
                  <p className="flex items-start gap-2">
                    <Smartphone size={16} className="text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white/80">Phone (online):</strong> Install the Service Cloud APK /
                      TestFlight from your Super Admin. Not the offline Service Mobile app.
                    </span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Monitor size={16} className="text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white/80">Desktop:</strong> Use the Cloud Electron build below (same cloud
                      desktop wrapper). Login with your seat user credentials.
                    </span>
                  </p>
                  <p className="text-xs text-white/40">
                    Access from Super Admin → service tenant →{' '}
                    <strong className="text-sky-300/90">Service cloud seats</strong>
                    (access mode + device slots). No <span className="font-mono text-emerald-400/70">DG-SM-</span> key.
                  </p>
                </div>

                {(cloudArm || cloudIntel) && (
                  <div className="space-y-3 pt-1 border-t border-white/10">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Desktop downloads</p>
                    {cloudArm ? (
                      <a
                        href={cloudArm.browser_download_url}
                        className="flex items-center justify-between p-4 rounded-xl border border-sky-500/20 hover:border-sky-400/50 hover:bg-sky-500/10 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <Apple size={20} className="text-white/60" />
                          <div>
                            <div className="font-semibold text-sm">Mac — Apple Silicon (M1/M2/M3)</div>
                            <div className="text-xs text-white/40">
                              {formatSize(cloudArm.size)} · Cloud Electron · .dmg
                            </div>
                          </div>
                        </div>
                        <Download size={16} className="text-white/40 group-hover:text-sky-300 transition-colors" />
                      </a>
                    ) : null}
                    {cloudIntel ? (
                      <a
                        href={cloudIntel.browser_download_url}
                        className="flex items-center justify-between p-4 rounded-xl border border-sky-500/20 hover:border-sky-400/50 hover:bg-sky-500/10 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <Apple size={20} className="text-white/60" />
                          <div>
                            <div className="font-semibold text-sm">Mac — Intel</div>
                            <div className="text-xs text-white/40">
                              {formatSize(cloudIntel.size)} · Cloud Electron · .dmg
                            </div>
                          </div>
                        </div>
                        <Download size={16} className="text-white/40 group-hover:text-sky-300 transition-colors" />
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Service Mobile — OFFLINE */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Smartphone size={18} className="text-emerald-400" />
                  <span className="font-bold text-lg">Dhando Service Mobile</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                    OFFLINE
                  </span>
                </div>
                <p className="text-sm text-white/45">
                  Phone-only offline ERP. Local database. Separate from Service Cloud seats above.
                </p>
              </div>
              <div className="px-6 py-4 space-y-3 text-sm text-white/60">
                <p>
                  <strong className="text-white/80">Android:</strong> Sideload the APK from Super Admin → Service
                  Mobile, or build with <code className="text-white/50">npm run cap:sync</code>.
                </p>
                <p>
                  <strong className="text-white/80">iOS:</strong> TestFlight invite from your admin.
                </p>
                <p className="text-xs text-white/40">
                  Requires a <span className="font-mono text-emerald-400/80">DG-SM-…</span> license. Do not use this
                  installer for online cloud seats.
                </p>
              </div>
            </motion.div>
          </div>
        )}

        {!loading && release && (
          <div className="space-y-6 mt-10">
            <p className="text-xs font-bold uppercase tracking-widest text-white/35 px-1">Other desktop apps</p>

            {/* On-Prem */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor size={18} className="text-brand" />
                    <span className="font-bold text-lg">Dhando On-Prem</span>
                    <span className="text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded-full font-bold">
                      OFFLINE
                    </span>
                  </div>
                  <p className="text-sm text-white/40">
                    Full desktop app with embedded database. Works completely offline.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 space-y-3">
                {arm64 ? (
                  <a
                    href={arm64.browser_download_url}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-brand/50 hover:bg-brand/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Apple size={20} className="text-white/60" />
                      <div>
                        <div className="font-semibold text-sm">Mac — Apple Silicon (M1/M2/M3)</div>
                        <div className="text-xs text-white/40">{formatSize(arm64.size)} · .dmg</div>
                      </div>
                    </div>
                    <Download size={16} className="text-white/40 group-hover:text-brand transition-colors" />
                  </a>
                ) : null}
                {intel ? (
                  <a
                    href={intel.browser_download_url}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-brand/50 hover:bg-brand/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Apple size={20} className="text-white/60" />
                      <div>
                        <div className="font-semibold text-sm">Mac — Intel</div>
                        <div className="text-xs text-white/40">{formatSize(intel.size)} · .dmg</div>
                      </div>
                    </div>
                    <Download size={16} className="text-white/40 group-hover:text-brand transition-colors" />
                  </a>
                ) : null}
                {!arm64 && !intel && <p className="text-white/30 text-sm py-2">No on-prem release assets found yet.</p>}
              </div>
            </motion.div>

            {/* Generic Cloud App note — same builds as Service Cloud desktop */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Monitor size={18} className="text-violet-400" />
                  <span className="font-bold text-lg">Dhando Cloud App</span>
                  <span className="text-[10px] bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">
                    CLOUD
                  </span>
                </div>
                <p className="text-sm text-white/40">
                  Generic cloud desktop wrapper (any business type). Same installer as Service Cloud desktop above.
                </p>
              </div>
              <div className="px-6 py-4 space-y-3">
                {cloudArm ? (
                  <a
                    href={cloudArm.browser_download_url}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Apple size={20} className="text-white/60" />
                      <div>
                        <div className="font-semibold text-sm">Mac — Apple Silicon (M1/M2/M3)</div>
                        <div className="text-xs text-white/40">{formatSize(cloudArm.size)} · .dmg</div>
                      </div>
                    </div>
                    <Download size={16} className="text-white/40 group-hover:text-violet-400 transition-colors" />
                  </a>
                ) : null}
                {cloudIntel ? (
                  <a
                    href={cloudIntel.browser_download_url}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Apple size={20} className="text-white/60" />
                      <div>
                        <div className="font-semibold text-sm">Mac — Intel</div>
                        <div className="text-xs text-white/40">{formatSize(cloudIntel.size)} · .dmg</div>
                      </div>
                    </div>
                    <Download size={16} className="text-white/40 group-hover:text-violet-400 transition-colors" />
                  </a>
                ) : null}
                {!cloudArm && !cloudIntel && (
                  <p className="text-white/30 text-sm py-2">No cloud desktop assets in the latest release yet.</p>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-white/5 bg-white/2 px-6 py-5 flex items-center justify-between opacity-50"
            >
              <div>
                <div className="font-semibold mb-0.5">Windows (desktop)</div>
                <div className="text-sm text-white/40">Coming soon</div>
              </div>
              <span className="text-xs text-white/30 border border-white/10 px-3 py-1 rounded-full">Soon</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-8 p-5 rounded-xl border border-white/10 bg-white/3"
            >
              <h3 className="font-bold mb-3 text-sm text-white/60 uppercase tracking-widest">Desktop install (Mac)</h3>
              <div className="space-y-2 text-sm text-white/50">
                {[
                  'Download the .dmg file above',
                  'Open it and drag Dhando to Applications',
                  'Right-click the app → Open (required for unsigned apps)',
                  'Click Open on the security popup',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle size={14} className="text-brand shrink-0 mt-0.5" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="text-center pt-4">
              <a
                href="https://github.com/prathame/DG-ERP/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors"
              >
                View all releases on GitHub <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
