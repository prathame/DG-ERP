import { motion } from 'motion/react';

export function DeskIllustration({ dark }: { dark: boolean }) {
  const screenBg = dark ? '#1a1f2e' : '#f0f4ff';
  const deskColor = dark ? '#2a2218' : '#c8a96e';
  const deskShadow = dark ? '#1a1510' : '#a07848';
  const chairColor = dark ? '#1e1e1e' : '#374151';
  const monitorColor = dark ? '#111' : '#222';
  const plantGreen = '#4ade80';

  return (
    <motion.div
      className="relative w-full select-none"
      style={{ maxWidth: 480 }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg viewBox="0 0 480 360" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">

        {/* ── Floor shadow ── */}
        <ellipse cx="240" cy="345" rx="160" ry="12" fill="rgba(0,0,0,0.12)" />

        {/* ── Chair ── */}
        <rect x="195" y="248" width="90" height="8" rx="4" fill={chairColor} />
        <rect x="225" y="256" width="30" height="60" rx="4" fill={chairColor} />
        <rect x="200" y="310" width="80" height="8" rx="4" fill={chairColor} />
        <rect x="208" y="318" width="12" height="22" rx="3" fill={chairColor} />
        <rect x="260" y="318" width="12" height="22" rx="3" fill={chairColor} />
        <circle cx="214" cy="342" r="6" fill={deskShadow} />
        <circle cx="266" cy="342" r="6" fill={deskShadow} />
        {/* Chair back */}
        <rect x="188" y="200" width="104" height="52" rx="8" fill={chairColor} />
        <rect x="196" y="208" width="88" height="36" rx="5" fill="rgba(255,255,255,0.05)" />

        {/* ── Person ── */}
        {/* Body */}
        <rect x="204" y="168" width="72" height="84" rx="16" fill={dark ? '#1e3a5f' : '#3b82f6'} />
        {/* Collar */}
        <path d="M228 168 L240 185 L252 168" fill={dark ? '#ffffff18' : '#ffffffaa'} />
        {/* Arms */}
        <rect x="174" y="178" width="34" height="16" rx="8" fill={dark ? '#1e3a5f' : '#3b82f6'} />
        <rect x="272" y="178" width="34" height="16" rx="8" fill={dark ? '#1e3a5f' : '#3b82f6'} />
        {/* Hands on keyboard */}
        <ellipse cx="192" cy="252" rx="14" ry="10" fill={dark ? '#f5c6a0' : '#fcd5b4'} />
        <ellipse cx="288" cy="252" rx="14" ry="10" fill={dark ? '#f5c6a0' : '#fcd5b4'} />
        {/* Head */}
        <ellipse cx="240" cy="148" rx="34" ry="36" fill={dark ? '#f5c6a0' : '#fcd5b4'} />
        {/* Hair */}
        <path d="M206 138 Q207 108 240 110 Q273 108 274 138 Q265 120 240 122 Q215 120 206 138Z" fill={dark ? '#1a0a00' : '#3d1a00'} />
        {/* Eyes */}
        <ellipse cx="228" cy="148" rx="5" ry="6" fill="white" />
        <ellipse cx="252" cy="148" rx="5" ry="6" fill="white" />
        <circle cx="230" cy="150" r="3" fill="#1a1a2e" />
        <circle cx="254" cy="150" r="3" fill="#1a1a2e" />
        <circle cx="231" cy="149" r="1" fill="white" />
        <circle cx="255" cy="149" r="1" fill="white" />
        {/* Smile */}
        <path d="M228 162 Q240 170 252 162" stroke={dark ? '#c07040' : '#c87040'} strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* ── Desk ── */}
        <rect x="100" y="256" width="280" height="18" rx="6" fill={deskColor} />
        <rect x="108" y="268" width="264" height="8" rx="3" fill={deskShadow} />
        {/* Desk legs */}
        <rect x="118" y="276" width="14" height="60" rx="4" fill={deskShadow} />
        <rect x="348" y="276" width="14" height="60" rx="4" fill={deskShadow} />

        {/* ── Monitor ── */}
        <rect x="152" y="150" width="176" height="106" rx="8" fill={monitorColor} />
        <rect x="157" y="155" width="166" height="96" rx="5" fill={screenBg} />
        {/* Monitor stand */}
        <rect x="228" y="256" width="24" height="14" rx="2" fill={monitorColor} />
        <rect x="210" y="268" width="60" height="6" rx="3" fill={monitorColor} />

        {/* ── Screen content — Dhandho dashboard ── */}
        {/* Top bar */}
        <rect x="157" y="155" width="166" height="18" rx="5" fill="rgba(242,125,38,0.9)" />
        <circle cx="168" cy="164" r="4" fill="rgba(255,255,255,0.5)" />
        {/* Brand text on screen */}
        <text x="240" y="167" textAnchor="middle" fontSize="9" fontWeight="800" fill="white" fontFamily="system-ui">Dhandho</text>

        {/* Dashboard cards */}
        <rect x="162" y="178" width="46" height="30" rx="3" fill="rgba(74,222,128,0.15)" />
        <text x="172" y="190" fontSize="5.5" fill="#4ade80" fontWeight="700">Revenue</text>
        <text x="172" y="200" fontSize="8" fill="#4ade80" fontWeight="800">₹2.4L</text>

        <rect x="213" y="178" width="46" height="30" rx="3" fill="rgba(96,165,250,0.15)" />
        <text x="220" y="190" fontSize="5.5" fill="#60a5fa" fontWeight="700">Orders</text>
        <text x="220" y="200" fontSize="8" fill="#60a5fa" fontWeight="800">38</text>

        <rect x="264" y="178" width="46" height="30" rx="3" fill="rgba(251,146,60,0.15)" />
        <text x="271" y="190" fontSize="5.5" fill="#fb923c" fontWeight="700">Stock</text>
        <text x="271" y="200" fontSize="8" fill="#fb923c" fontWeight="800">1.2K</text>

        {/* Chart bars */}
        <rect x="162" y="220" width="148" height="26" rx="3" fill="rgba(255,255,255,0.04)" />
        {[0,1,2,3,4,5,6].map((b) => {
          const heights = [12, 18, 10, 22, 15, 20, 16];
          const h = heights[b];
          return (
            <rect key={b} x={167 + b * 20} y={240 - h} width="12" height={h} rx="2"
              fill={`rgba(242,125,38,${0.4 + b * 0.08})`} />
          );
        })}

        {/* ── Keyboard ── */}
        <rect x="178" y="258" width="124" height="10" rx="3" fill={dark ? '#1a1a1a' : '#d1d5db'} />
        {[0,1,2,3,4,5].map(k => (
          <rect key={k} x={183 + k * 19} y="260" width="14" height="6" rx="1.5"
            fill={dark ? '#2d2d2d' : '#9ca3af'} />
        ))}

        {/* ── Mouse ── */}
        <rect x="316" y="256" width="26" height="36" rx="13" fill={dark ? '#2d2d2d' : '#9ca3af'} />
        <line x1="329" y1="257" x2="329" y2="274" stroke={dark ? '#444' : '#6b7280'} strokeWidth="1.5" />

        {/* ── Coffee mug ── */}
        <rect x="128" y="236" width="24" height="22" rx="4" fill={dark ? '#6b3a2a' : '#92400e'} />
        <path d="M152 242 Q162 242 162 249 Q162 256 152 256" stroke={dark ? '#6b3a2a' : '#92400e'} strokeWidth="3" fill="none" />
        <rect x="130" y="238" width="20" height="6" rx="2" fill={dark ? '#c084fc' : '#8b5cf6'} opacity="0.6" />
        {/* Steam */}
        <motion.path d="M136 234 Q138 228 136 222" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" fill="none"
          animate={{ opacity: [0.2, 0.6, 0.2], y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }} />
        <motion.path d="M142 232 Q144 225 142 219" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" fill="none"
          animate={{ opacity: [0.2, 0.5, 0.2], y: [0, -4, 0] }} transition={{ duration: 2.3, repeat: Infinity, delay: 0.4 }} />

        {/* ── Plant ── */}
        <rect x="348" y="232" width="20" height="26" rx="4" fill={dark ? '#7c3a1e' : '#c2410c'} />
        <ellipse cx="358" cy="232" rx="12" ry="10" fill={plantGreen} opacity="0.9" />
        <ellipse cx="348" cy="228" rx="9" ry="8" fill={plantGreen} />
        <ellipse cx="368" cy="226" rx="9" ry="8" fill={plantGreen} opacity="0.8" />

        {/* ── Floating notification ── */}
        <motion.g
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="310" y="130" width="110" height="36" rx="8"
            fill={dark ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)'}
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
          <rect x="310" y="130" width="4" height="36" rx="2" fill="#4ade80" />
          <text x="322" y="145" fontSize="7" fontWeight="700" fill="#4ade80">New Order!</text>
          <text x="322" y="158" fontSize="6" fill={dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'}>₹14,500 · Patel Traders</text>
        </motion.g>

      </svg>
    </motion.div>
  );
}
