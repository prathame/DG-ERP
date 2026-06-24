import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; message: string; severity: string }[]>([]);
  const [count, setCount] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.notifications.list().then((r) => { setNotifications(r.notifications); setCount(r.count); }).catch(() => {});
    const interval = setInterval(() => {
      api.notifications.list().then((r) => { setNotifications(r.notifications); setCount(r.count); }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors">
        <Bell size={22} className="text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{count > 9 ? '9+' : count}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden z-50">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="font-bold text-sm">Notifications</span>
              <span className="text-xs text-gray-500">{count} alert{count !== 1 ? 's' : ''}</span>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">All clear!</p>
              ) : notifications.map((n) => (
                <div key={n.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className={cn("mt-0.5 w-2 h-2 rounded-full shrink-0", n.severity === 'critical' ? "bg-rose-500" : n.severity === 'warning' ? "bg-amber-500" : "bg-blue-500")} />
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">{n.title}</p>
                      <p className="text-sm text-gray-700">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
