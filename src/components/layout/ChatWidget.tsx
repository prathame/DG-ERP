import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Mic, Square, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { NAV_POSITION_PREF_CHANGED_EVENT } from '../../lib/navPositionPref';

interface Message {
  id: number;
  text: string;
  role: 'user' | 'assistant';
  action?: { type: string; params: Record<string, string> };
  timestamp: Date;
}

/** Above feature modals (~100–120); below command palette (300). */
const Z_CHAT = 'z-[200]';
const Z_TIP = 'z-[199]';

// ponytail: reuse browser SpeechRecognition for voice input
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_#`]/g, '').slice(0, 500);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'en-IN';
  u.rate = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const indian = voices.find(v => v.lang.startsWith('en-IN') || v.lang.startsWith('hi-IN'));
  if (indian) u.voice = indian;
  window.speechSynthesis.speak(u);
}

/** Global event for AI assistant actions (navigation, form pre-fill). */
export const AI_ACTION_EVENT = 'dg-ai-action';

export function ChatWidget({ desktopGlass = false }: { desktopGlass?: boolean }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      text: 'Hi! I\'m Dhandho AI — your business assistant.\n\nI can help you with anything:\n• "What are today\'s sales?"\n• "Create bill for Ramesh"\n• "Show low stock items"\n• "Add a new product"\n• "Go to purchases"\n\nJust type or tap the mic to speak.',
      role: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, bx: 0, by: 0 });
  const [portalReady, setPortalReady] = useState(false);

  const quickActions = ['sales today', 'low stock', 'unpaid invoices', 'daily report', 'help'];

  useEffect(() => {
    setPortalReady(true);
    return () => {
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const reset = () => setPos(null);
    window.addEventListener(NAV_POSITION_PREF_CHANGED_EVENT, reset);
    return () => window.removeEventListener(NAV_POSITION_PREF_CHANGED_EVENT, reset);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = false;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      bx: pos?.x ?? e.currentTarget.getBoundingClientRect().left,
      by: pos?.y ?? e.currentTarget.getBoundingClientRect().top,
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging.current = true;
      if (dragging.current) {
        const nx = Math.max(8, Math.min(window.innerWidth - 64, dragStart.current.bx + dx));
        const ny = Math.max(8, Math.min(window.innerHeight - 64, dragStart.current.by + dy));
        setPos({ x: nx, y: ny });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEscapeKey(() => {
    setOpen(false);
    return true;
  }, open);

  const executeAction = useCallback((action: { type: string; params: Record<string, string> }) => {
    window.dispatchEvent(new CustomEvent(AI_ACTION_EVENT, { detail: action }));
  }, []);

  const sendChat = async (text: string) => {
    if (!text || loading) return;
    const userMsg: Message = { id: Date.now(), text, role: 'user', timestamp: new Date() };
    setMessages(m => [...m, userMsg]);
    setLoading(true);
    try {
      const history = messages
        .filter(m => m.id > 0)
        .slice(-10)
        .map(m => ({ role: m.role, text: m.text }));
      history.push({ role: 'user' as const, text });

      const data = await api.chatbot.assistant(text, history);
      const botMsg: Message = {
        id: Date.now() + 1,
        text: data.text || 'No response',
        role: 'assistant',
        action: data.action || undefined,
        timestamp: new Date(),
      };
      setMessages(m => [...m, botMsg]);
      speak(data.text || '');
      if (data.action) executeAction(data.action);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Connection error';
      setMessages(m => [...m, { id: Date.now() + 1, text: msg, role: 'assistant', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendChat(text);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    // ponytail: en-IN covers Hinglish; browser picks up Hindi words too
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = ev => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) void sendChat(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const accent = desktopGlass ? 'var(--dg-primary)' : '#F27D26';

  const formatText = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line === '') return <p key={i} className="h-2" />;
      const parts: React.ReactNode[] = [];
      let last = 0;
      const regex = /\*([^*]+)\*|₹([\d,]+)/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index));
        if (m[1]) parts.push(<strong key={`${i}-${m.index}`}>{m[1]}</strong>);
        else if (m[2])
          parts.push(
            <span key={`${i}-${m.index}`} style={{ color: accent, fontWeight: 600 }}>
              ₹{m[2]}
            </span>,
          );
        last = regex.lastIndex;
      }
      if (last < line.length) parts.push(line.slice(last));
      return (
        <p key={i} className="text-sm">
          {parts}
        </p>
      );
    });
  };

  const fabPosStyle = pos ? { left: pos.x, top: pos.y, right: 'auto' as const, bottom: 'auto' as const } : undefined;

  const tipPosStyle = pos
    ? { left: pos.x - 168, top: pos.y + 8, right: 'auto' as const, bottom: 'auto' as const }
    : undefined;

  if (!portalReady) return null;

  return ReactDOM.createPortal(
    <div className={cn(desktopGlass && 'dg-glass-scope')} data-chat-widget-root="">
      {/* FAB */}
      <motion.button
        type="button"
        onClick={() => {
          if (!dragging.current) setOpen(!open);
        }}
        onPointerDown={onPointerDown}
        whileTap={dragging.current ? undefined : { scale: 0.92 }}
        style={fabPosStyle}
        className={cn(
          Z_CHAT,
          'fixed w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing touch-none',
          !pos && 'dg-chat-fab-default',
          desktopGlass
            ? cn(
                'shadow-[0_10px_28px_color-mix(in_srgb,var(--dg-primary)_35%,transparent)]',
                open ? 'bg-[#3d4450] hover:bg-[#323842]' : 'dg-bg-primary hover:opacity-90',
              )
            : cn('shadow-2xl', open ? 'bg-gray-700' : 'bg-brand'),
        )}
        aria-label={open ? 'Close Dhandho AI' : 'Open Dhandho AI'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X size={24} className="text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles size={24} className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        {!open && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 animate-pulse',
              'bg-emerald-400 border-white',
            )}
          />
        )}
      </motion.button>

      {/* Tooltip */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ delay: 1, duration: 0.3 }}
            style={tipPosStyle}
            className={cn(
              Z_TIP,
              'fixed px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap pointer-events-none',
              !pos && 'dg-chat-tip-default',
              desktopGlass
                ? 'bg-[var(--dg-chat-surface)] dg-ink border border-[var(--dg-card-border)] shadow-[0_8px_24px_rgba(25,28,30,0.12)]'
                : 'bg-white border border-gray-200 text-gray-700 shadow-lg',
            )}
          >
            Ask Dhandho AI
            <span className="ml-1.5" style={{ color: accent }} aria-hidden>
              ✦
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className={cn(
              Z_CHAT,
              'fixed inset-0 lg:inset-auto dg-chat-panel-default lg:w-[400px] lg:h-[min(520px,calc(100vh-8rem))] lg:max-h-[calc(100vh-6rem)] lg:rounded-2xl overflow-hidden flex flex-col pt-[env(safe-area-inset-top,0px)] lg:pt-0',
              desktopGlass
                ? 'bg-[var(--dg-chat-panel)] lg:border lg:border-[var(--dg-card-border)] shadow-[0_16px_48px_rgba(25,28,30,0.18)]'
                : 'bg-white lg:border lg:border-gray-200 shadow-2xl',
            )}
          >
            {/* Header */}
            <div
              className={cn(
                'px-5 py-4 flex items-center gap-3 shrink-0',
                desktopGlass
                  ? 'bg-[var(--dg-chat-surface)] border-b border-[var(--dg-card-border)]'
                  : 'bg-[#151619] text-white',
              )}
            >
              <div className="relative">
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    desktopGlass ? 'dg-bg-primary text-white' : 'bg-brand',
                  )}
                >
                  <Sparkles size={20} strokeWidth={2.25} className="text-white" />
                </div>
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2',
                    desktopGlass ? 'border-[var(--dg-chat-surface)]' : 'border-[#151619]',
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('font-bold', desktopGlass && 'dg-ink')}>Dhandho AI</p>
                <p className={cn('text-xs truncate', desktopGlass ? 'dg-muted' : 'text-gray-400')}>
                  Your business assistant — ask anything
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  'p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl shrink-0',
                  desktopGlass
                    ? 'dg-muted hover:bg-[var(--dg-chat-messages)] hover:opacity-100'
                    : 'hover:bg-white/10 text-white/80 hover:text-white',
                )}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div
              className={cn(
                'flex-1 overflow-y-auto p-4 space-y-3',
                desktopGlass ? 'bg-[var(--dg-chat-messages)]' : 'bg-gray-50',
              )}
            >
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] px-4 py-2.5 rounded-2xl',
                      msg.role === 'user'
                        ? cn('text-white rounded-br-md', desktopGlass ? 'dg-bg-primary' : 'bg-brand')
                        : desktopGlass
                          ? 'bg-[var(--dg-chat-surface)] border border-[var(--dg-card-border)] dg-ink rounded-bl-md shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-700 rounded-bl-md shadow-sm',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm text-white">{msg.text}</p>
                    ) : (
                      <div className="space-y-0.5">{formatText(msg.text)}</div>
                    )}
                    <p
                      className={cn(
                        'text-[10px] mt-1',
                        msg.role === 'user' ? 'text-white/70' : desktopGlass ? 'dg-muted' : 'text-gray-400',
                      )}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div
                    className={cn(
                      'rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border',
                      desktopGlass
                        ? 'bg-[var(--dg-chat-surface)] border-[var(--dg-card-border)]'
                        : 'bg-white border-gray-200',
                    )}
                  >
                    <div className="flex gap-1">
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick actions */}
            <div
              className={cn(
                'px-3 py-2 border-t flex gap-1.5 overflow-x-auto',
                desktopGlass
                  ? 'border-[var(--dg-card-border)] bg-[var(--dg-chat-surface)]'
                  : 'border-gray-100 bg-white',
              )}
            >
              {quickActions.map(cmd => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => void sendChat(cmd)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    desktopGlass
                      ? 'bg-[var(--dg-chat-messages)] dg-muted hover:opacity-100 hover:bg-[var(--dg-card-hover)]'
                      : 'bg-gray-100 hover:bg-gray-200',
                  )}
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Input */}
            <div
              className={cn(
                'px-3 py-3 border-t flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] lg:pb-3',
                desktopGlass
                  ? 'border-[var(--dg-card-border)] bg-[var(--dg-chat-surface)]'
                  : 'border-gray-100 bg-white',
              )}
            >
              {speechCtor() && (
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    'p-2.5 rounded-xl transition-colors shrink-0',
                    listening
                      ? 'bg-rose-100 text-rose-600 animate-pulse'
                      : desktopGlass
                        ? 'bg-[var(--dg-chat-messages)] dg-muted hover:opacity-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                  )}
                  aria-label={listening ? 'Stop listening' : 'Speak'}
                >
                  {listening ? <Square size={18} /> : <Mic size={18} />}
                </button>
              )}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={listening ? 'Listening…' : 'Ask anything…'}
                className={cn(
                  'flex-1 min-w-0 px-4 py-2.5 border-none rounded-xl text-sm focus:outline-none',
                  desktopGlass
                    ? 'bg-[var(--dg-chat-messages)] dg-ink focus:ring-2 focus:ring-[var(--dg-primary)]/40'
                    : 'bg-gray-100 focus:ring-2 focus:ring-brand',
                )}
                disabled={loading || listening}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className={cn(
                  'p-2.5 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                  desktopGlass ? 'dg-bg-primary hover:opacity-90' : 'bg-brand hover:bg-brand-dark',
                )}
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
