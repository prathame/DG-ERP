import { motion, AnimatePresence } from 'motion/react';
import { memo, useEffect, useRef, useState } from 'react';

const SLATS = 14;

function splitGraphemes(str: string): string[] {
  try {
    return [...new Intl.Segmenter().segment(str)].map(s => s.segment);
  } catch {
    return [...str];
  }
}

// Characters that cycle on the flap before landing (Latin + symbols look great)
const NOISE = ['8', 'M', 'W', 'H', '#', 'X', '0', '@', '$', '%', '&', 'N', 'B', 'R', 'Z'];

// One flap cell — dark panel, center divider, rapid char cycling
const SplitFlapChar = memo(function SplitFlapChar({
  char,
  delayMs,
  trigger,
  instant,
}: {
  char: string;
  delayMs: number;
  trigger: number;
  instant?: boolean;
}) {
  const [face, setFace] = useState(' ');
  const [scaleY, setScaleY] = useState(1);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!trigger) return;
    cancelled.current = false;

    if (instant) {
      // Single clean flip — no noise cycling
      const t = setTimeout(() => {
        if (cancelled.current) return;
        setScaleY(0);
        setTimeout(() => {
          if (!cancelled.current) {
            setFace(char);
            setScaleY(1);
          }
        }, 45);
      }, delayMs);
      return () => {
        cancelled.current = true;
        clearTimeout(t);
      };
    }

    let cyclesDone = 0;
    const totalCycles = 10 - Math.min(delayMs / 80, 6);

    const flip = () => {
      if (cancelled.current) return;
      setScaleY(0);
      setTimeout(() => {
        if (cancelled.current) return;
        const isLast = cyclesDone >= totalCycles - 1;
        setFace(isLast ? char : NOISE[cyclesDone % NOISE.length]);
        setScaleY(1);
        cyclesDone++;
        if (!isLast) setTimeout(flip, 55 + cyclesDone * 6);
      }, 45);
    };

    const t = setTimeout(flip, delayMs);
    return () => {
      cancelled.current = true;
      clearTimeout(t);
    };
  }, [char, delayMs, trigger, instant]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)',
        border: '1.5px solid #2c2c2c',
        borderRadius: 6,
        minWidth: '0.62em',
        padding: '0.06em 0.1em',
        position: 'relative',
        boxShadow: '0 3px 12px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
      }}
    >
      <motion.span
        style={{ display: 'inline-block', color: '#f5f5f5', fontWeight: 800 }}
        animate={{ scaleY }}
        transition={{ duration: 0.045, ease: 'easeInOut' }}
      >
        {face}
      </motion.span>
      {/* Horizontal split line — the signature departure board detail */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 2,
          background: '#000',
          boxShadow: '0 -1px 0 rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

function SplitFlapWord({ word, trigger }: { word: string; trigger: number }) {
  const chars = splitGraphemes(word);
  // trigger=1 is the initial English reveal — skip noise, just flip cleanly
  const instant = trigger === 1;
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {chars.map((char, i) =>
        char === ' ' ? (
          <div key={i} style={{ width: '0.35em' }} />
        ) : (
          <SplitFlapChar key={i} char={char} delayMs={i * (instant ? 60 : 80)} trigger={trigger} instant={instant} />
        ),
      )}
    </div>
  );
}

function playShutterSound() {
  try {
    const ctx = new AudioContext();
    // Mobile browsers block autoplay — attach to first touch to unlock
    const unlockAudio = () => {
      if (ctx.state === 'suspended') ctx.resume();
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    if (ctx.state === 'suspended') ctx.resume(); // try immediately (works on desktop)

    const now = ctx.currentTime;

    // Animation sync (must match CSS values in component):
    //   first slat delay  = 0.04s
    //   stagger per slat  = 0.04s
    //   slat duration     = 0.32s
    //   last slat (13th) done at: 0.04 + 13*0.04 + 0.32 = 0.88s
    const FIRST_SLAT = 0.04;
    const LAST_SLAT = 0.88; // shutter fully open

    const rattleStart = now + FIRST_SLAT;
    const rattleEnd = now + LAST_SLAT;
    const rDur = rattleEnd - rattleStart; // 0.84s

    // ── Metallic rattle (filtered white noise) ────────────────────────
    const bufLen = Math.ceil(ctx.sampleRate * (rDur + 0.1));
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.5;

    // LFO at 18Hz → individual slat clatter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    // Envelope: attack fast, ride steady, fade as last slat slows
    const rattle = ctx.createGain();
    rattle.gain.setValueAtTime(0, rattleStart);
    rattle.gain.linearRampToValueAtTime(0.3, rattleStart + 0.08); // snap up
    rattle.gain.setValueAtTime(0.26, rattleEnd - 0.18); // hold
    rattle.gain.linearRampToValueAtTime(0, rattleEnd); // fade with last slat

    noise.connect(bp);
    bp.connect(rattle);
    rattle.connect(ctx.destination);
    lfo.connect(lfoGain);
    noise.start(rattleStart);
    lfo.start(rattleStart);
    noise.stop(rattleEnd);
    lfo.stop(rattleEnd);

    // ── Low mechanical rumble ─────────────────────────────────────────
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(60, rattleStart);
    rumble.frequency.linearRampToValueAtTime(38, rattleEnd);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.07, rattleStart);
    rumbleGain.gain.linearRampToValueAtTime(0, rattleEnd);
    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumble.start(rattleStart);
    rumble.stop(rattleEnd);

    // ── Clank: fires exactly when last slat hits the top ─────────────
    const clankAt = now + LAST_SLAT;
    const clank = ctx.createOscillator();
    clank.type = 'sawtooth';
    clank.frequency.setValueAtTime(200, clankAt);
    clank.frequency.exponentialRampToValueAtTime(55, clankAt + 0.28);
    const clankGain = ctx.createGain();
    clankGain.gain.setValueAtTime(0.4, clankAt);
    clankGain.gain.exponentialRampToValueAtTime(0.001, clankAt + 0.32);
    clank.connect(clankGain);
    clankGain.connect(ctx.destination);
    clank.start(clankAt);
    clank.stop(clankAt + 0.35);

    // ── Soft chime exactly when brand appears (t = LAST_SLAT + 0.02) ──
    // Synced to t1 reveal timeout (0.9s from start)
    const chimeAt = now + 0.92;
    const chime = ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, chimeAt); // A5
    chime.frequency.exponentialRampToValueAtTime(660, chimeAt + 0.5); // drift down gently
    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0, chimeAt);
    chimeGain.gain.linearRampToValueAtTime(0.12, chimeAt + 0.02); // instant attack
    chimeGain.gain.exponentialRampToValueAtTime(0.001, chimeAt + 0.7); // natural decay
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(chimeAt);
    chime.stop(chimeAt + 0.72);

    setTimeout(() => ctx.close(), 6000);
  } catch {
    // Autoplay blocked or Web Audio not supported — silent fail
  }
}

export function ShutterIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'shutter' | 'reveal' | 'done'>('shutter');
  const [wordLang, setWordLang] = useState<'en' | 'gu' | 'hi' | 'mr'>('en');
  const [flipTrigger, setFlipTrigger] = useState(0);

  const WORDS = {
    en: 'Dhandho',
    gu: 'ધંધો',
    hi: 'धन दो', // "Give wealth" — wordplay on Dhandho
    mr: 'धंदा', // Marathi equivalent
  };

  useEffect(() => {
    playShutterSound();
    // EN (1.5s) → GU (1.5s) → HI (1.5s) → MR (1.5s) → fade
    const t1 = setTimeout(() => {
      setPhase('reveal');
      setFlipTrigger(1);
    }, 900);
    const t2 = setTimeout(() => {
      setWordLang('gu');
      setFlipTrigger(2);
    }, 2400);
    const t3 = setTimeout(() => {
      setWordLang('hi');
      setFlipTrigger(3);
    }, 3900);
    const t4 = setTimeout(() => {
      setWordLang('mr');
      setFlipTrigger(4);
    }, 5400);
    const t5 = setTimeout(() => setPhase('done'), 7000);
    const t6 = setTimeout(onDone, 7500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
    };
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
          <div
            className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none"
            style={{ zIndex: 2 }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse 55% 35% at 50% 52%, rgba(242,125,38,0.16) 0%, transparent 70%)',
              }}
            />

            {/* Top tagline — changes with each language flip */}
            <div style={{ height: '1.6em', overflow: 'hidden', marginBottom: '0.75rem' }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={`top-${wordLang}`}
                  className="font-bold tracking-[0.25em] uppercase"
                  style={{ color: 'rgba(242,125,38,0.7)', fontSize: 'clamp(0.75rem, 2vw, 1rem)' }}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: revealed ? 0 : 10, opacity: revealed ? 1 : 0 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ delay: revealed ? 0.2 : 0, duration: 0.4 }}
                >
                  {
                    {
                      en: 'Run Smart · Run Simple',
                      gu: 'ધંધો કરો, Smart કરો',
                      hi: 'धन दो, Smart बनो',
                      mr: 'धंदा करा, Smart व्हा',
                    }[wordLang]
                  }
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Logo */}
            <motion.img
              src="/icons/logo-brand.png"
              alt="Dhandho"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: revealed ? 1 : 0, scale: revealed ? 1 : 0.85 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: 'clamp(80px, 16vw, 160px)',
                width: 'clamp(80px, 16vw, 160px)',
                objectFit: 'contain',
                borderRadius: '22%',
                filter: 'drop-shadow(0 0 32px rgba(242,125,38,0.4))',
              }}
            />

            {/* Split-flap wordmark */}
            <div style={{ fontSize: 'clamp(2.8rem, 10vw, 7rem)' }}>
              <SplitFlapWord word={WORDS[wordLang]} trigger={flipTrigger} />
            </div>

            {/* Tagline — synced to current language */}
            <div className="mt-5" style={{ height: '1.4em', overflow: 'hidden', position: 'relative' }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={wordLang}
                  className="tracking-widest uppercase text-center"
                  style={{
                    color: 'rgba(255,255,255,0.28)',
                    fontSize: 'clamp(0.65rem, 1.5vw, 0.85rem)',
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 10 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  {
                    {
                      en: 'The Gujarati Way to Run Business',
                      gu: 'ધંધો — Business નું બીજું નામ',
                      hi: 'धन दो — अपने Business को Smart बनाओ',
                      mr: 'धंदा करा — Smart व्यापार करा',
                    }[wordLang]
                  }
                </motion.p>
              </AnimatePresence>
            </div>

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
              animate={
                revealed ? { rotate: [-40, 8, -5, 3, 0], opacity: 1, y: 0 } : { rotate: -40, opacity: 0, y: -30 }
              }
              transition={{ delay: 0.6, duration: 1.2, ease: 'easeOut' }}
            >
              {/* String */}
              <div style={{ width: 2, height: 28, background: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
              {/* Sign board */}
              <div
                style={{
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
                }}
              >
                OPEN
              </div>
            </motion.div>
          </div>

          {/* ── Shutter slats ─────────────────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col pointer-events-none" style={{ zIndex: 10 }}>
            {Array.from({ length: SLATS }).map((_, i) => {
              const delay = 0.04 + i * 0.04;
              const slat = SLATS - 1 - i;
              return (
                <motion.div key={slat} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 30%, #3a3a3a 50%, #1a1a1a 70%, #252525 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5)',
                    }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                  />
                  <motion.div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: 'rgba(255,255,255,0.06)',
                    }}
                    initial={{ y: 0 }}
                    animate={{ y: '-100%' }}
                    transition={{ delay, duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
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
            <div
              key={side}
              className={`absolute top-0 bottom-0 ${side} w-3 sm:w-4`}
              style={{
                background: 'linear-gradient(90deg, #1a1a1a, #2d2d2d, #1a1a1a)',
                zIndex: 12,
                boxShadow: side === 'left-0' ? 'inset -2px 0 4px rgba(0,0,0,0.6)' : 'inset 2px 0 4px rgba(0,0,0,0.6)',
              }}
            />
          ))}

          {/* ── Skip button ───────────────────────────────────────────── */}
          <motion.button
            onClick={onDone}
            className="absolute bottom-6 right-6 text-xs tracking-widest uppercase"
            style={{
              color: 'rgba(255,255,255,0.2)',
              zIndex: 20,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
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
