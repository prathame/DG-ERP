import React, { useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

type ConfirmOpts = { title?: string; message: string; confirmLabel?: string; variant?: 'danger' | 'warning' | 'info' };

export function useConfirm() {
  const [state, setState] = useState<ConfirmOpts | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOpts | string): Promise<boolean> => {
    const o = typeof opts === 'string' ? { message: opts } : opts;
    setState(o);
    return new Promise(resolve => { resolveRef.current = resolve; });
  }, []);

  const handle = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  const ConfirmRenderer = () => (
    <AnimatePresence>
      {state && <ConfirmDialog title={state.title || 'Confirm'} message={state.message} confirmLabel={state.confirmLabel || 'Confirm'} variant={state.variant || 'danger'} onConfirm={() => handle(true)} onCancel={() => handle(false)} />}
    </AnimatePresence>
  );

  return { confirm, ConfirmRenderer };
}
