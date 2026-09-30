/* Facility settings (records officer): escalation thresholds and other
   configurable parameters, the offline/sync panel and demo data reset. */

import { useEffect, useState } from 'react';
import { RefreshCw, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import { db, nowIso, resetDemoData } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useConfig } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useSync } from '../lib/sync';
import { useToast } from '../lib/toast';
import { Field, Modal, SectionTitle, cx } from '../components/ui';
import { formatDateTime } from '../lib/logic';

const HARDENING = [
  'Encryption in transit (TLS) and at rest (database-level) on the pilot server.',
  'Hosting in South Africa with a POPIA-compliant operator agreement.',
  'Real server API replaces the on-device sync simulation; conflict handling for offline edits.',
  'Security testing before go-live and at regular intervals; documented breach-response procedure.',
  'SMS gateway integration with a local provider and delivery reporting.',
  'Staff identity: individual logins with facility-managed credentials instead of demo personas.',
];

export function Settings() {
  const { user } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const { online, pending, lastSyncAt, flushNow, flushing, simulatedOffline, setSimulatedOffline } = useSync();

  const [form, setForm] = useState({
    name: config.name,
    routineToHigh: String(config.escalationRoutineToHighMinutes),
    highToUrgent: String(config.escalationHighToUrgentMinutes),
    target: String(config.targetUrgentMinutes),
    avg: String(config.avgConsultMinutes),
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setForm({
      name: config.name,
      routineToHigh: String(config.escalationRoutineToHighMinutes),
      highToUrgent: String(config.escalationHighToUrgentMinutes),
      target: String(config.targetUrgentMinutes),
      avg: String(config.avgConsultMinutes),
    });
  }, [config]);

  const save = async () => {
    if (!user) return;
    const routineToHigh = Number(form.routineToHigh);
    const highToUrgent = Number(form.highToUrgent);
    const target = Number(form.target);
    const avg = Number(form.avg);
    if (
      ![routineToHigh, highToUrgent, target, avg].every((n) => Number.isFinite(n) && n > 0) ||
      !form.name.trim()
    ) {
      setError('All values must be positive numbers and the facility name cannot be empty.');
      return;
    }
    setError(null);
    await db.config.put({
      id: 'facility',
      name: form.name.trim(),
      escalationRoutineToHighMinutes: routineToHigh,
      escalationHighToUrgentMinutes: highToUrgent,
      targetUrgentMinutes: target,
      avgConsultMinutes: avg,
      updatedAt: nowIso(),
    });
    await logAudit(
      actorOf(user),
      'CONFIG_UPDATED',
      'CONFIG',
      'facility',
      `Escalation thresholds: routine→high ${routineToHigh} min, high→urgent ${highToUrgent} min; urgent target ${target} min; avg consult ${avg} min`
    );
    push('Facility settings saved — thresholds apply immediately.', 'success');
  };

  const doReset = async () => {
    await resetDemoData();
    if (user) {
      await logAudit(
        actorOf(user),
        'DEMO_RESET',
        'SYSTEM',
        'demo-data',
        'Demo data reset to the seeded clinic day'
      );
    }
    setConfirmReset(false);
    push('Demo data reset.', 'success');
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">
          Facility parameters, connectivity and demo data. Changes are written to the audit log.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <SectionTitle>Facility &amp; thresholds</SectionTitle>
          <div className="space-y-3">
            <Field label="Facility name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Routine → high (min)" hint="Auto-escalation for routine patients.">
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.routineToHigh}
                  onChange={(e) => setForm((f) => ({ ...f, routineToHigh: e.target.value }))}
                />
              </Field>
              <Field label="High → urgent (min)" hint="Auto-escalation for high-priority patients.">
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.highToUrgent}
                  onChange={(e) => setForm((f) => ({ ...f, highToUrgent: e.target.value }))}
                />
              </Field>
              <Field label="Urgent target (min)" hint="Target: urgent seen within this time.">
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                />
              </Field>
              <Field label="Avg consult (min)" hint="Used for estimated wait times.">
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.avg}
                  onChange={(e) => setForm((f) => ({ ...f, avg: e.target.value }))}
                />
              </Field>
            </div>
            {error ? (
              <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                Save settings
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Last updated {formatDateTime(config.updatedAt)} — thresholds are agreed with the pilot facility
              and shown clearly on the dashboard.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <SectionTitle>Connectivity &amp; sync</SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  'pill',
                  online
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                )}
              >
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? 'Online' : 'Offline'}
              </span>
              <span className="pill bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                {pending} change{pending === 1 ? '' : 's'} waiting to sync
              </span>
              {lastSyncAt ? (
                <span className="text-[11px] text-slate-400">Last sync {formatDateTime(lastSyncAt)}</span>
              ) : null}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-700"
                checked={simulatedOffline}
                onChange={(e) => setSimulatedOffline(e.target.checked)}
              />
              Simulate offline (demo) — actions stay on this device and sync when switched back
            </label>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void flushNow()}
                disabled={flushing}
              >
                <RefreshCw className={cx('h-4 w-4', flushing && 'animate-spin')} />
                Sync now
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Actions taken offline are stored on the device (IndexedDB) and flushed automatically when the
              connection returns. Pages stay light for older devices and slow networks; the app is
              installable and opens without a connection.
            </p>
          </div>

          <div className="card p-4">
            <SectionTitle>Demo data</SectionTitle>
            <p className="text-xs text-slate-500">
              Reset the database back to the seeded clinic day (patients, queues, admissions and audit
              entries). Useful between review sessions.
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
                <TriangleAlert className="h-4 w-4" />
                Reset demo data
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <SectionTitle>Production hardening checklist</SectionTitle>
        <ul className="grid gap-2 lg:grid-cols-2">
          {HARDENING.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {confirmReset ? (
        <Modal
          title="Reset demo data?"
          subtitle="All patients, visits, admissions and audit entries on this device will be replaced with the seeded demo clinic day."
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void doReset()}>
                Reset and reload
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            This cannot be undone. Any offline changes that have not synced will be lost.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
