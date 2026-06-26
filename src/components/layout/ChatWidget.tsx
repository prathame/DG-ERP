import React, { useState, useRef, useEffect } from 'react';
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
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.9 }}
        className={cn(
          "fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[150] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors",
          open ? "bg-gray-700" : "bg-[#F27D26]"
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
            className="fixed bottom-24 lg:bottom-10 right-[5.5rem] lg:right-[5.5rem] z-[149] bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-200 text-sm font-medium text-gray-700 whitespace-nowrap"
          >
            May I help you? <span className="text-[#F27D26]">👋</span>
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-white" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed inset-0 lg:inset-auto lg:bottom-24 lg:right-6 z-[150] lg:w-[380px] lg:h-[400px] lg:max-h-[calc(100vh-12rem)] bg-white lg:rounded-2xl shadow-2xl lg:border lg:border-gray-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#151619] text-white px-5 py-4 flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center text-xl">🤖</div>
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
                      ? "bg-[#F27D26] text-white rounded-br-md"
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
                className="flex-1 px-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26] focus:outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="p-2.5 bg-[#F27D26] text-white rounded-xl hover:bg-[#D96A1C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
