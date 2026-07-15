import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const SLATS = 14;

function playShutterSound() {
  try {
    const ctx = new AudioContext();

    const resume = () => {
      if (ctx.state === 'suspended') ctx.resume();
    };
    resume();

    const now = ctx.currentTime;
    const duration = 1.6; // matches shutter animation

    // ── Metallic rattle (filtered white noise) ────────────────────────
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    // Bandpass → metallic sheen
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;

    // LFO at 20 Hz → slat-rattle rhythm
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 20;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    // Envelope: fade in fast, hold, fade out
    const rattle = ctx.createGain();
    rattle.gain.setValueAtTime(0, now);
    rattle.gain.linearRampToValueAtTime(0.28, now + 0.12);
    rattle.gain.setValueAtTime(0.25, now + duration - 0.3);
    rattle.gain.linearRampToValueAtTime(0, now + duration);

    noise.connect(bp);
    bp.connect(rattle);
    rattle.connect(ctx.destination);
    noise.start(now);
    lfo.start(now);
    noise.stop(now + duration);
    lfo.stop(now + duration);

    // ── Low rumble (underneath the rattle) ───────────────────────────
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(55, now);
    rumble.frequency.linearRampToValueAtTime(40, now + duration);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.06, now);
    rumbleGain.gain.linearRampToValueAtTime(0, now + duration);
    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumble.start(now);
    rumble.stop(now + duration);

    // ── Final metallic clank when shutter locks at top ────────────────
    const clankTime = now + duration - 0.05;
    const clank = ctx.createOscillator();
    clank.type = 'sawtooth';
    clank.frequency.setValueAtTime(180, clankTime);
    clank.frequency.exponentialRampToValueAtTime(60, clankTime + 0.25);
    const clankGain = ctx.createGain();
    clankGain.gain.setValueAtTime(0.35, clankTime);
    clankGain.gain.exponentialRampToValueAtTime(0.001, clankTime + 0.3);
    clank.connect(clankGain);
    clankGain.connect(ctx.destination);
    clank.start(clankTime);
    clank.stop(clankTime + 0.3);

    // Auto-close context after done
    setTimeout(() => ctx.close(), (duration + 0.5) * 1000);
  } catch {
    // Autoplay blocked or Web Audio not supported — silent fail
  }
}

export function ShutterIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'shutter' | 'reveal' | 'done'>('shutter');

  useEffect(() => {
    playShutterSound();
    // 1.6s → shutter open → brand holds 3s → fade out
    const t1 = setTimeout(() => setPhase('reveal'), 1600);
    const t2 = setTimeout(() => setPhase('done'), 5200);
    const t3 = setTimeout(onDone, 5700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const revealed = phase === 'reveal';

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="shutter-overlay"
          className="fixed inset-0 z-[9999] overflow-hidden"
          style={{ background: '#09090B' }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
        >

          {/* ── Warm light sweep — rises from bottom as shutter opens ── */}
          <motion.div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: '70%',
              background: 'linear-gradient(0deg, rgba(242,125,38,0.22) 0%, rgba(255,180,80,0.1) 40%, transparent 100%)',
              zIndex: 1,
            }}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: revealed ? 1 : 0, y: revealed ? '0%' : '100%' }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* ── Brand reveal ─────────────────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none" style={{ zIndex: 2 }}>
            {/* Ambient glow */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 55% 35% at 50% 52%, rgba(242,125,38,0.16) 0%, transparent 70%)' }} />

            {/* Gujarati tagline */}
            <motion.p
              className="font-bold tracking-[0.25em] uppercase mb-3"
              style={{ color: 'rgba(242,125,38,0.7)', fontSize: 'clamp(0.75rem, 2vw, 1rem)' }}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: revealed ? 0 : 10, opacity: revealed ? 1 : 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              ધંધો કરો, Smart કરો
            </motion.p>

            {/* Main wordmark — letter by letter */}
            <div className="flex items-center" style={{ fontSize: 'clamp(3.5rem, 12vw, 8rem)', lineHeight: 1, fontWeight: 800 }}>
              {'Dhandho'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  style={{ color: '#ffffff', display: 'inline-block' }}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 30 }}
                  transition={{ delay: 0.05 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Tagline */}
            <motion.p
              className="mt-5 tracking-widest uppercase"
              style={{ color: 'rgba(255,255,255,0.28)', fontSize: 'clamp(0.65rem, 1.5vw, 0.85rem)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: revealed ? 1 : 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              The Gujarati Way to Run Business
            </motion.p>

            {/* OPEN sign — swings in after reveal */}
            <motion.div
              style={{
                position: 'absolute',
                top: '12%',
                right: '8%',
                transformOrigin: 'top center',
                zIndex: 20,
              }}
              initial={{ rotate: -40, opacity: 0, y: -30 }}
              animate={revealed ? { rotate: [-40, 8, -5, 3, 0], opacity: 1, y: 0 } : { rotate: -40, opacity: 0, y: -30 }}
              transition={{ delay: 0.6, duration: 1.2, ease: 'easeOut' }}
            >
              {/* String */}
              <div style={{ width: 2, height: 28, background: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
              {/* Sign board */}
              <div style={{
                background: 'linear-gradient(135deg, #F27D26, #D96A1C)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.2em',
                padding: '8px 16px',
                borderRadius: 6,
                boxShadow: '0 4px 20px rgba(242,125,38,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
                border: '2px solid rgba(255,255,255,0.15)',
                userSelect: 'none',
              }}>
                OPEN
              </div>
            </motion.div>
          </div>

          {/* ── Shutter slats ─────────────────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col pointer-events-none" style={{ zIndex: 10 }}>
            {Array.from({ length: SLATS }).map((_, i) => {
              const delay = 0.1 + i * 0.07;
              const slat = SLATS - 1 - i;
              return (
                <motion.div key={slat} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <motion.div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 30%, #3a3a3a 50%, #1a1a1a 70%, #252525 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  />
                  <motion.div
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* ── Orange floor strip ────────────────────────────────────── */}
          <motion.div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: 4, background: '#F27D26', zIndex: 11 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: revealed ? 0 : 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          />

          {/* ── Side guides ───────────────────────────────────────────── */}
          {['left-0', 'right-0'].map(side => (
            <div key={side} className={`absolute top-0 bottom-0 ${side} w-3 sm:w-4`} style={{
              background: 'linear-gradient(90deg, #1a1a1a, #2d2d2d, #1a1a1a)',
              zIndex: 12,
              boxShadow: side === 'left-0' ? 'inset -2px 0 4px rgba(0,0,0,0.6)' : 'inset 2px 0 4px rgba(0,0,0,0.6)',
            }} />
          ))}

          {/* ── Skip button ───────────────────────────────────────────── */}
          <motion.button
            onClick={onDone}
            className="absolute bottom-6 right-6 text-xs tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.2)', zIndex: 20, background: 'none', border: 'none', cursor: 'pointer' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ delay: 1, duration: 0.4 }}
            whileHover={{ color: 'rgba(255,255,255,0.6)' }}
          >
            Skip →
          </motion.button>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
