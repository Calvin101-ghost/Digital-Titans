/* Application shell: header with connection status, role-based navigation,
   the signed-in staff badge, and the automatic-escalation watcher that runs
   while any staff member has the app open. */

import { useEffect, type ReactNode } from 'react';
import {
  BedDouble,
  Cloud,
  CloudUpload,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  ScrollText,
  Settings,
  Stethoscope,
  UserPlus,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { Role, StaffUser } from '../lib/types';
import { ROLE_META, departmentLabel } from '../lib/catalog';
import { db, nowIso } from '../lib/db';
import { SYSTEM_ACTOR, logAudit } from '../lib/audit';
import { escalationDue, formatClock } from '../lib/logic';
import { useConfig } from '../lib/hooks';
import { useSync } from '../lib/sync';
import { useToast } from '../lib/toast';
import { cx } from './ui';

export type TabKey = 'reception' | 'triage' | 'dashboard' | 'admitted' | 'audit' | 'settings';

export const NAV: Record<Role, TabKey[]> = {
  RECEPTION: ['reception'],
  TRIAGE: ['triage', 'dashboard', 'admitted'],
  CLINICIAN: ['dashboard', 'admitted'],
  ADMIN: ['dashboard', 'admitted', 'audit', 'settings'],
};

const TAB_META: Record<TabKey, { label: string; icon: LucideIcon }> = {
  reception: { label: 'Reception', icon: UserPlus },
  triage: { label: 'Triage', icon: Stethoscope },
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  admitted: { label: 'Admitted patients', icon: BedDouble },
  audit: { label: 'Audit log', icon: ScrollText },
  settings: { label: 'Settings', icon: Settings },
};

export function defaultTab(role: Role): TabKey {
  return NAV[role][0];
}

function SyncPill() {
  const { online, pending, flushing, lastSyncAt, flushNow, simulatedOffline, setSimulatedOffline } = useSync();

  let pill: ReactNode;
  if (!online) {
    pill = (
      <span className="pill bg-amber-50 text-amber-800 ring-1 ring-amber-200">
        <WifiOff className="h-3.5 w-3.5" />
        Offline{pending > 0 ? ` · ${pending} stored` : ''}
      </span>
    );
  } else if (flushing) {
    pill = (
      <span className="pill bg-sky-50 text-sky-700 ring-1 ring-sky-200">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing…
      </span>
    );
  } else if (pending > 0) {
    pill = (
      <button
        type="button"
        onClick={() => void flushNow()}
        className="pill bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
        title="Sync now"
      >
        <CloudUpload className="h-3.5 w-3.5" />
        {pending} to sync
      </button>
    );
  } else {
    pill = (
      <span className="pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" title="All changes synced">
        <Cloud className="h-3.5 w-3.5" />
        Synced{lastSyncAt ? ` ${formatClock(lastSyncAt)}` : ''}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {pill}
      <button
        type="button"
        onClick={() => setSimulatedOffline(!simulatedOffline)}
        className={cx(
          'rounded-md p-1.5 transition-colors',
          simulatedOffline ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'
        )}
        title={simulatedOffline ? 'Back online (demo toggle)' : 'Simulate offline for a demo'}
      >
        {simulatedOffline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
      </button>
    </div>
  );
}

let escalationRun = false;

/** Applies routine→high and high→urgent escalations while the app is open. */
function EscalationWatcher() {
  const config = useConfig();
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (escalationRun) return;
      escalationRun = true;
      try {
        const waiting = await db.visits.where('status').equals('WAITING').toArray();
        const due = escalationDue(waiting, new Date(), config);
        if (due.length === 0) return;
        for (const item of due) {
          await db.visits.update(item.visit.id, {
            priority: item.to,
            escalatedTo: item.to,
            escalatedAt: nowIso(),
          });
          await logAudit(
            SYSTEM_ACTOR,
            'PRIORITY_ESCALATED',
            'VISIT',
            item.visit.id,
            `Auto-escalated ${item.visit.priority} → ${item.to}. ${item.reason}`,
            item.visit.patientId
          );
        }
        if (!cancelled) {
          push(
            `${due.length} patient${due.length === 1 ? '' : 's'} automatically escalated after long waits.`,
            'warn'
          );
        }
      } finally {
        escalationRun = false;
      }
    };

    void run();
    const timer = setInterval(() => void run(), 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [config, push]);

  return null;
}

export function Shell({
  user,
  tab,
  onTab,
  onSignOut,
  children,
}: {
  user: StaffUser;
  tab: TabKey;
  onTab: (tab: TabKey) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { online, pending } = useSync();
  const config = useConfig();

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <EscalationWatcher />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-tight text-slate-800">Beyond the Queue</p>
                <p className="truncate text-[11px] leading-tight text-slate-500">{config.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SyncPill />
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
                  {initials}
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {ROLE_META[user.role].label}
                    {user.department ? ` · ${departmentLabel(user.department)}` : ''}
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn-secondary !px-2.5" onClick={onSignOut} title="Sign out">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto">
            {NAV[user.role].map((key) => {
              const meta = TAB_META[key];
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTab(key)}
                  className={cx(
                    '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                    tab === key
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {!online ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800">
          <WifiOff className="mr-1.5 inline h-3.5 w-3.5" />
          Offline mode — actions are stored on this device and sync automatically when the connection
          returns.{pending > 0 ? ` ${pending} change${pending === 1 ? '' : 's'} waiting.` : ''}
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2">
        <p className="text-[11px] leading-relaxed text-slate-400">
          MVP prototype — health data is special personal information under POPIA. Access is role-based and
          every record opened or changed is written to the audit log. In production: encryption in transit
          and at rest, hosting in South Africa, and a documented breach-response procedure.
        </p>
      </footer>
    </div>
  );
}
