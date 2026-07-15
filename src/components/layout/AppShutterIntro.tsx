import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const SLATS = 12;
// Slat timings (must match audio sync below)
const FIRST_DELAY = 0.03;
const STAGGER     = 0.04;
const SLAT_DUR    = 0.28;
// last slat done at: FIRST_DELAY + (SLATS-1)*STAGGER + SLAT_DUR
const LAST_SLAT   = FIRST_DELAY + (SLATS - 1) * STAGGER + SLAT_DUR; // ~0.75s

function playAppShutterSound() {
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    const rattleStart = now + FIRST_DELAY;
    const rattleEnd   = now + LAST_SLAT;
    const rDur        = rattleEnd - rattleStart;

    // Metallic rattle
    const bufLen = Math.ceil(ctx.sampleRate * (rDur + 0.05));
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18;
    const lfoG = ctx.createGain(); lfoG.gain.value = 350;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    const rattleG = ctx.createGain();
    rattleG.gain.setValueAtTime(0, rattleStart);
    rattleG.gain.linearRampToValueAtTime(0.22, rattleStart + 0.06);
    rattleG.gain.setValueAtTime(0.2, rattleEnd - 0.1);
    rattleG.gain.linearRampToValueAtTime(0, rattleEnd);
    noise.connect(bp); bp.connect(rattleG); rattleG.connect(ctx.destination);
    noise.start(rattleStart); lfo.start(rattleStart);
    noise.stop(rattleEnd); lfo.stop(rattleEnd);

    // Clank at last slat
    const clankAt = now + LAST_SLAT;
    const clank = ctx.createOscillator();
    clank.type = 'sawtooth';
    clank.frequency.setValueAtTime(180, clankAt);
    clank.frequency.exponentialRampToValueAtTime(55, clankAt + 0.22);
    const clankG = ctx.createGain();
    clankG.gain.setValueAtTime(0.3, clankAt);
    clankG.gain.exponentialRampToValueAtTime(0.001, clankAt + 0.28);
    clank.connect(clankG); clankG.connect(ctx.destination);
    clank.start(clankAt); clank.stop(clankAt + 0.3);

    // Soft chime at reveal
    const chimeAt = now + LAST_SLAT + 0.02;
    const chime = ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, chimeAt);
    chime.frequency.exponentialRampToValueAtTime(660, chimeAt + 0.4);
    const chimeG = ctx.createGain();
    chimeG.gain.setValueAtTime(0, chimeAt);
    chimeG.gain.linearRampToValueAtTime(0.1, chimeAt + 0.02);
    chimeG.gain.exponentialRampToValueAtTime(0.001, chimeAt + 0.6);
    chime.connect(chimeG); chimeG.connect(ctx.destination);
    chime.start(chimeAt); chime.stop(chimeAt + 0.65);

    setTimeout(() => ctx.close(), 6000);
  } catch { /* silent fail */ }
}

interface Props {
  companyName: string;
  onDone: () => void;
}

export function AppShutterIntro({ companyName, onDone }: Props) {
  const [phase, setPhase] = useState<'shutter' | 'reveal' | 'done'>('shutter');

  useEffect(() => {
    playAppShutterSound();
    // shutter open at ~LAST_SLAT → 1s hold → fade
    const revealAt = Math.round(LAST_SLAT * 1000) + 50;  // ~800ms
    const t1 = setTimeout(() => setPhase('reveal'), revealAt);
    const t2 = setTimeout(() => setPhase('done'), revealAt + 4000);
    const t3 = setTimeout(onDone, revealAt + 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const revealed = phase === 'reveal';

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="app-shutter"
          className="fixed inset-0 z-[9999] overflow-hidden"
          style={{ background: '#09090B' }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
        >
          {/* Warm light sweep */}
          <motion.div className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: '60%', background: 'linear-gradient(0deg, rgba(242,125,38,0.18) 0%, transparent 100%)', zIndex: 1 }}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: revealed ? 1 : 0, y: revealed ? '0%' : '100%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Brand + company name */}
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none" style={{ zIndex: 2 }}>
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 30% at 50% 52%, rgba(242,125,38,0.14) 0%, transparent 70%)' }} />

            {/* Dhandho wordmark */}
            <div className="flex items-center" style={{ fontSize: 'clamp(2.5rem, 8vw, 5.5rem)', lineHeight: 1, fontWeight: 800 }}>
              {'Dhandho'.split('').map((char, i) => (
                <motion.span key={i} style={{ color: '#ffffff', display: 'inline-block' }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 20 }}
                  transition={{ delay: 0.04 + i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Company name — the personal touch */}
            <motion.p
              style={{ color: 'rgba(242,125,38,0.85)', fontSize: 'clamp(0.9rem, 2.5vw, 1.3rem)', fontWeight: 600, marginTop: 10, letterSpacing: '0.05em' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 8 }}
              transition={{ delay: 0.45, duration: 0.4 }}
            >
              {companyName}
            </motion.p>

            {/* Gujarati tagline */}
            <motion.p
              style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', marginTop: 16, letterSpacing: '0.25em', textTransform: 'uppercase' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: revealed ? 1 : 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              ધંધો કરો, Smart કરો
            </motion.p>
          </div>

          {/* Shutter slats */}
          <div className="absolute inset-0 flex flex-col pointer-events-none" style={{ zIndex: 10 }}>
            {Array.from({ length: SLATS }).map((_, i) => {
              const delay = FIRST_DELAY + i * STAGGER;
              const slat  = SLATS - 1 - i;
              return (
                <motion.div key={slat} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <motion.div
                    style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#2a2a2a 0%,#1f1f1f 30%,#3a3a3a 50%,#1a1a1a 70%,#252525 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.5)' }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: SLAT_DUR, ease: [0.4, 0, 0.2, 1] }}
                  />
                  <motion.div
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: SLAT_DUR, ease: [0.4, 0, 0.2, 1] }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Orange floor strip */}
          <motion.div className="absolute bottom-0 left-0 right-0" style={{ height: 3, background: '#F27D26', zIndex: 11 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: revealed ? 0 : 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          />

          {/* Side guides */}
          {['left-0','right-0'].map(side => (
            <div key={side} className={`absolute top-0 bottom-0 ${side} w-2.5`}
              style={{ background: 'linear-gradient(90deg,#1a1a1a,#2d2d2d,#1a1a1a)', zIndex: 12,
                boxShadow: side === 'left-0' ? 'inset -2px 0 4px rgba(0,0,0,0.6)' : 'inset 2px 0 4px rgba(0,0,0,0.6)' }}
            />
          ))}

          {/* Skip */}
          <motion.button onClick={onDone}
            className="absolute bottom-5 right-5 text-xs tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.18)', zIndex: 20, background: 'none', border: 'none', cursor: 'pointer' }}
            initial={{ opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={{ delay: 0.5, duration: 0.3 }}
            whileHover={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Skip →
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
