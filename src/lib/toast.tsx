/* Minimal toast notifications. */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';

type Kind = 'success' | 'info' | 'warn' | 'error';

interface ToastItem {
  id: number;
  message: string;
  kind: Kind;
}

interface ToastContextValue {
  push: (message: string, kind?: Kind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<Kind, { border: string; icon: ReactNode }> = {
  success: { border: 'border-l-4 border-emerald-500', icon: <CircleCheck className="h-4 w-4 text-emerald-600" /> },
  info: { border: 'border-l-4 border-sky-500', icon: <Info className="h-4 w-4 text-sky-600" /> },
  warn: { border: 'border-l-4 border-amber-500', icon: <TriangleAlert className="h-4 w-4 text-amber-600" /> },
  error: { border: 'border-l-4 border-rose-500', icon: <CircleAlert className="h-4 w-4 text-rose-600" /> },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg ${STYLES[t.kind].border}`}
          >
            <span className="mt-0.5">{STYLES[t.kind].icon}</span>
            <p className="flex-1 text-sm text-slate-700">{t.message}</p>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
