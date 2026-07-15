import { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

// ponytail: module-level check — runs once, avoids repeated window access
const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

export function CustomCursor() {
  const [hovered, setHovered] = useState(false);
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);
  const ringX = useSpring(dotX, { stiffness: 150, damping: 15 });
  const ringY = useSpring(dotY, { stiffness: 150, damping: 15 });

  useEffect(() => {
    if (isTouchDevice) return;
    document.body.style.cursor = 'none';

    const onMove = (e: MouseEvent) => {
      dotX.set(e.clientX);
      dotY.set(e.clientY);
    };
    const onOver = (e: MouseEvent) => {
      setHovered(!!(e.target as Element).closest('button, a'));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
    };
  }, [dotX, dotY]);

  if (isTouchDevice) return null;

  return (
    <>
      {/* Small dot — follows mouse exactly */}
      <motion.div
        className="pointer-events-none fixed z-[9999] rounded-full bg-brand"
        style={{ width: 6, height: 6, x: dotX, y: dotY, translateX: '-50%', translateY: '-50%' }}
      />
      {/* Ring — follows with spring lag, expands on button/link hover */}
      <motion.div
        className="pointer-events-none fixed z-[9999] rounded-full border border-brand/40"
        animate={{ width: hovered ? 48 : 32, height: hovered ? 48 : 32, opacity: hovered ? 0.8 : 0.5 }}
        transition={{ duration: 0.2 }}
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
      />
    </>
  );
}
