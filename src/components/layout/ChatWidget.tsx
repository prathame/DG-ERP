import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { id: Date.now(), text, sender: 'user', timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { id: Date.now() + 1, text: data.text || 'No response', sender: 'bot', timestamp: new Date() }]);
    } catch {
      setMessages((m) => [...m, { id: Date.now() + 1, text: 'Connection error. Is the server running?', sender: 'bot', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const formatText = (text: string) => {
    return text.split('\n').map((line, i) => {
      const formatted = line
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
        .replace(/₹([\d,]+)/g, '<span style="color:#F27D26;font-weight:600;">₹$1</span>');
      return <p key={i} className={cn("text-sm", line === '' && "h-2")} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-[150] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110",
          open ? "bg-gray-700 rotate-0" : "bg-[#F27D26]"
        )}
      >
        {open ? <X size={24} className="text-white" /> : <MessageCircle size={24} className="text-white" />}
      </button>

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[150] w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            style={{ height: '500px', maxHeight: 'calc(100vh - 8rem)' }}
          >
            {/* Header */}
            <div className="bg-[#151619] text-white px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center font-bold text-lg">S</div>
              <div>
                <p className="font-bold">ERP Assistant</p>
                <p className="text-xs text-gray-400">Ask anything about your business</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.sender === 'user' ? "justify-end" : "justify-start")}>
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
                </div>
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
              {['sales today', 'low stock', 'pending payments', 'all vendors'].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={async () => {
                    const userMsg: Message = { id: Date.now(), text: cmd, sender: 'user', timestamp: new Date() };
                    setMessages((m) => [...m, userMsg]);
                    setLoading(true);
                    try {
                      const res = await fetch('/api/chatbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: cmd }) });
                      const data = await res.json();
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
