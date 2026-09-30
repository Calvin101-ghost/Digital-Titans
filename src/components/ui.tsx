/* Small shared UI primitives: badges, KPIs, modal, form field, masked ID,
   waiting timer and tabs. Deliberately lightweight — pages stay responsive
   on older devices and slow connections. */

import { useEffect, useState, type ReactNode } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { PRIORITY_META, STATUS_META } from '../lib/catalog';
import type { Priority, VisitStatus } from '../lib/types';
import { formatWaiting, maskIdNumber, minutesBetween } from '../lib/logic';
import { useNow } from '../lib/hooks';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {action}
    </div>
  );
}

export function PriorityBadge({
  priority,
  escalated,
  className,
}: {
  priority: Priority;
  escalated?: boolean;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cx('pill', meta.badge, className)}
      title={escalated ? 'Automatically escalated after a long wait' : meta.blurb}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
      {escalated ? ' ↑' : ''}
    </span>
  );
}

export function StatusBadge({ status }: { status: VisitStatus }) {
  const meta = STATUS_META[status];
  return <span className={cx('pill', meta.badge)}>{meta.label}</span>;
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('pill bg-slate-100 text-slate-600 ring-1 ring-slate-200', className)}>{children}</span>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-800',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    danger: 'text-red-700',
  };
  return (
    <div className="card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums', tones[tone])}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

/** Live-ticking waiting time from an ISO timestamp. */
export function WaitingTimer({ from, className }: { from: string; className?: string }) {
  const now = useNow(15000);
  return (
    <span className={cx('tabular-nums', className)}>{formatWaiting(minutesBetween(from, now))}</span>
  );
}

export function waitToneClass(mins: number): string {
  if (mins >= 60) return 'text-red-600';
  if (mins >= 30) return 'text-amber-600';
  return 'text-slate-700';
}

export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cx('card mx-auto my-4 w-full p-5', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <span className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-sm text-slate-700">{value || '—'}</span>
    </div>
  );
}

/** ID numbers are masked by default. Revealing is a logged action. */
export function MaskedId({
  value,
  canReveal,
  onReveal,
}: {
  value: string;
  canReveal: boolean;
  onReveal?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      {revealed ? value : maskIdNumber(value)}
      {canReveal ? (
        <button
          type="button"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title={revealed ? 'Hide ID number' : 'Reveal ID number (logged)'}
          onClick={() => {
            if (!revealed) onReveal?.();
            setRevealed((r) => !r);
          }}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
            value === tab.value
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' ? (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

/** Simulated SMS preview (the pilot uses a local SMS gateway — here we just
    render exactly what would be sent). */
export function SmsBubble({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        SMS preview — simulated gateway
      </p>
      <div className="max-w-sm rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
        {text}
      </div>
    </div>
  );
}
