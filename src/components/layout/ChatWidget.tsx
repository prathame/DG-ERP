import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: "Hello! I'm your ERP assistant. Type a vendor name, barcode, or try:\n• \"sales today\"\n• \"low stock\"\n• \"pending payments\"\n• \"help\"", sender: 'bot', timestamp: new Date() },
  ]);
  const [loading, setLoading] = useState(false);
  const [quickActions, setQuickActions] = useState<string[]>(['daily report', 'sales today', 'low stock', 'pending payments', 'all vendors']);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, bx: 0, by: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, bx: pos?.x ?? (window.innerWidth - 72), by: pos?.y ?? (window.innerHeight - 80) };
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
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      api.chatbot.quickActions().then(setQuickActions).catch(() => {});
    }
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { id: Date.now(), text, sender: 'user', timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const data = await api.chatbot.send(text);
      setMessages((m) => [...m, { id: Date.now() + 1, text: data.text || 'No response', sender: 'bot', timestamp: new Date() }]);
    } catch {
      setMessages((m) => [...m, { id: Date.now() + 1, text: 'Connection error. Is the server running?', sender: 'bot', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

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
        else if (m[2]) parts.push(<span key={`${i}-${m.index}`} style={{ color: '#F27D26', fontWeight: 600 }}>₹{m[2]}</span>);
        last = regex.lastIndex;
      }
      if (last < line.length) parts.push(line.slice(last));
      return <p key={i} className="text-sm">{parts}</p>;
    });
  };

  return (
    <>
      {/* Floating button with pulse */}
      <motion.button
        type="button"
        onClick={() => { if (!dragging.current) setOpen(!open); }}
        onPointerDown={onPointerDown}
        whileTap={dragging.current ? undefined : { scale: 0.9 }}
        style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
        className={cn(
          "z-[150] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing touch-none",
          pos ? 'fixed' : '',
          open ? "bg-gray-700" : "bg-brand"
        )}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={24} className="text-white" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle size={24} className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        {!open && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />}
      </motion.button>

      {/* "May I help you?" tooltip */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ delay: 1, duration: 0.3 }}
            style={pos ? { left: pos.x - 160, top: pos.y + 4, right: 'auto', bottom: 'auto', position: 'fixed' as const } : undefined}
            className={cn("z-[149] bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-medium text-gray-700 whitespace-nowrap", pos ? '' : 'mt-2')}
          >
            May I help you? <span className="text-brand">👋</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat window — portal to body so it escapes sidebar */}
      {ReactDOM.createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed inset-0 lg:inset-auto lg:bottom-6 lg:right-6 z-[150] lg:w-[400px] lg:h-[450px] lg:max-h-[calc(100vh-6rem)] bg-white lg:rounded-2xl shadow-2xl lg:border lg:border-gray-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#151619] text-white px-5 py-4 flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center text-xl">🤖</div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#151619]" />
              </div>
              <div>
                <p className="font-bold">ERP Assistant</p>
                <p className="text-xs text-gray-400">Online — ask anything about your business</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cn("flex", msg.sender === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] px-4 py-2.5 rounded-2xl",
                    msg.sender === 'user'
                      ? "bg-brand text-white rounded-br-md"
                      : "bg-white border border-gray-200 text-gray-700 rounded-bl-md shadow-sm"
                  )}>
                    {msg.sender === 'user' ? (
                      <p className="text-sm">{msg.text}</p>
                    ) : (
                      <div className="space-y-0.5">{formatText(msg.text)}</div>
                    )}
                    <p className={cn("text-[10px] mt-1", msg.sender === 'user' ? "text-white/60" : "text-gray-400")}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick actions */}
            <div className="px-3 py-2 border-t border-gray-100 flex gap-1.5 overflow-x-auto bg-white">
              {quickActions.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={async () => {
                    const userMsg: Message = { id: Date.now(), text: cmd, sender: 'user', timestamp: new Date() };
                    setMessages((m) => [...m, userMsg]);
                    setLoading(true);
                    try {
                      const data = await api.chatbot.send(cmd);
                      setMessages((m) => [...m, { id: Date.now() + 1, text: data.text || 'No response', sender: 'bot', timestamp: new Date() }]);
                    } catch { setMessages((m) => [...m, { id: Date.now() + 1, text: 'Connection error.', sender: 'bot', timestamp: new Date() }]); }
                    finally { setLoading(false); }
                  }}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-full whitespace-nowrap transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-gray-100 bg-white flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a vendor name, barcode, or query..."
                className="flex-1 px-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="p-2.5 bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
