import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const SLATS = 14;

export function ShutterIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'shutter' | 'reveal' | 'done'>('shutter');

  // Phase timeline
  useEffect(() => {
    // Shutter fully open at ~1.6s → hold brand for 3s → fade out
    const t1 = setTimeout(() => setPhase('reveal'), 1600);
    const t2 = setTimeout(() => setPhase('done'), 5200);
    const t3 = setTimeout(onDone, 5700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="shutter-overlay"
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{ background: '#09090B' }}
          animate={phase === 'reveal' ? { opacity: 1 } : {}}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeInOut' } }}
        >
          {/* ── Brand reveal (behind shutter) ─────────────────────────── */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'reveal' ? 1 : 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(242,125,38,0.18) 0%, transparent 70%)',
              }}
            />
            {/* Gujarati script */}
            <motion.p
              className="text-brand/60 text-lg sm:text-xl font-bold tracking-[0.3em] uppercase mb-2"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: phase === 'reveal' ? 0 : 8, opacity: phase === 'reveal' ? 1 : 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              style={{ fontFamily: 'system-ui' }}
            >
              ધંધો કરો, Smart કરો
            </motion.p>
            {/* Main wordmark */}
            <motion.h1
              className="text-white font-bold tracking-tight"
              style={{ fontSize: 'clamp(3.5rem, 12vw, 8rem)', lineHeight: 1 }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: phase === 'reveal' ? 0 : 20, opacity: phase === 'reveal' ? 1 : 0 }}
              transition={{ delay: 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              Dhandho
            </motion.h1>
            {/* Tagline */}
            <motion.p
              className="text-white/30 text-sm sm:text-base mt-4 tracking-widest uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'reveal' ? 1 : 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              The Gujarati Way to Run Business
            </motion.p>
          </motion.div>

          {/* ── Shutter slats ─────────────────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col pointer-events-none" style={{ zIndex: 10 }}>
            {Array.from({ length: SLATS }).map((_, i) => {
              const delay = 0.1 + i * 0.07; // slightly faster stagger
              const slat = SLATS - 1 - i;   // bottom slat moves first
              return (
                <motion.div
                  key={slat}
                  style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
                >
                  {/* Slat body */}
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `linear-gradient(180deg,
                        #2a2a2a 0%,
                        #1f1f1f 30%,
                        #3a3a3a 50%,
                        #1a1a1a 70%,
                        #252525 100%
                      )`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{
                      delay,
                      duration: 0.5,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  />
                  {/* Slat ridge line */}
                  <motion.div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'rgba(255,255,255,0.06)',
                    }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* ── Bottom frame / floor ──────────────────────────────────── */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-3"
            style={{ background: 'linear-gradient(0deg, #F27D26 0%, #F27D2600 100%)', zIndex: 11 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          />

          {/* ── Side guides ───────────────────────────────────────────── */}
          {['left-0', 'right-0'].map(side => (
            <div
              key={side}
              className={`absolute top-0 bottom-0 ${side} w-3 sm:w-4`}
              style={{
                background: 'linear-gradient(90deg, #1a1a1a, #2d2d2d, #1a1a1a)',
                zIndex: 12,
                boxShadow: side === 'left-0'
                  ? 'inset -2px 0 4px rgba(0,0,0,0.6)'
                  : 'inset 2px 0 4px rgba(0,0,0,0.6)',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
