/* Triage: every arrival is confirmed by a nurse before joining a queue.
   The system suggests a priority from the reason for visit; the nurse
   confirms it or overrides it with a recorded reason. Patients never set
   their own priority. */

import { useMemo, useState } from 'react';
import { Check, SquarePen } from 'lucide-react';
import { db, nowIso } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useAllVisits, useConfig, useNow, usePatientsIndex } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useToast } from '../lib/toast';
import { PRIORITY_META, departmentLabel, reasonLabel } from '../lib/catalog';
import { effectivePriority, formatClock, isToday, minutesSince } from '../lib/logic';
import type { Visit } from '../lib/types';
import { EmptyState, Kpi, PriorityBadge, cx, waitToneClass } from '../components/ui';
import { OverrideDialog } from '../components/flows';

export function Triage({ onOpenPatient }: { onOpenPatient: (patientId: string) => void }) {
  const { user } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const now = useNow(15000);
  const visits = useAllVisits();
  const patientsIndex = usePatientsIndex();

  const [overrideFor, setOverrideFor] = useState<Visit | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const pending = useMemo(
    () =>
      visits
        .filter((v) => v.status === 'WAITING' && v.triageState === 'PENDING')
        .sort((a, b) => (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? '')),
    [visits]
  );

  const triagedToday = useMemo(
    () =>
      visits
        .filter((v) => v.triagedAt && isToday(v.triagedAt, now))
        .sort((a, b) => (b.triagedAt ?? '').localeCompare(a.triagedAt ?? ''))
        .slice(0, 10),
    [visits, now]
  );

  const longestWaiting = pending.reduce((max, v) => {
    const mins = v.arrivedAt ? minutesSince(v.arrivedAt, now) : 0;
    return Math.max(max, mins);
  }, 0);

  const confirm = async (visit: Visit) => {
    if (!user) return;
    setConfirming(visit.id);
    try {
      // Never downgrade an automatic escalation that happened while waiting.
      const target = effectivePriority(visit, now, config);
      await db.visits.update(visit.id, {
        triageState: 'CONFIRMED',
        priority: target,
        triagedAt: nowIso(),
        triagedBy: user.name,
      });
      const patient = patientsIndex.get(visit.patientId);
      await logAudit(
        actorOf(user),
        'TRIAGED',
        'VISIT',
        visit.id,
        `Confirmed ${PRIORITY_META[target].label} priority for ${patient ? `${patient.firstName} ${patient.lastName}` : visit.reference} (${reasonLabel(visit.reasonCode)})`,
        visit.patientId
      );
      push(`${PRIORITY_META[target].label} priority confirmed — patient is now in the queue.`, 'success');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Triage</h1>
          <p className="text-sm text-slate-500">
            Confirm or override the suggested priority for every arrival. The tool supports clinical
            judgement — it never replaces it.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Awaiting triage" value={pending.length} tone={pending.length > 3 ? 'warn' : 'default'} />
        <Kpi
          label="Longest wait"
          value={`${longestWaiting} min`}
          tone={longestWaiting >= 30 ? 'danger' : longestWaiting >= 15 ? 'warn' : 'default'}
          sub="arrival → triage"
        />
        <Kpi label="Triaged today" value={triagedToday.length} tone="good" />
      </div>

      {pending.length === 0 ? (
        <EmptyState title="No patients waiting for triage" hint="New arrivals appear here as soon as reception marks them arrived." />
      ) : (
        <div className="space-y-3">
          {pending.map((visit) => {
            const patient = patientsIndex.get(visit.patientId);
            const waited = visit.arrivedAt ? minutesSince(visit.arrivedAt, now) : 0;
            const suggested = effectivePriority(visit, now, config);
            return (
              <div key={visit.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-bold text-teal-700 hover:underline"
                        onClick={() => onOpenPatient(visit.patientId)}
                      >
                        {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
                      </button>
                      {patient ? (
                        <span className="text-xs text-slate-400">
                          {patient.age} yrs · {patient.gender.toLowerCase()} · {patient.fileNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      <strong className="font-semibold">{reasonLabel(visit.reasonCode)}</strong> ·{' '}
                      {departmentLabel(visit.department)}
                    </p>
                    {patient ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {patient.currentMedicalStatus || 'No status recorded'}
                        {patient.allergies && patient.allergies !== 'None known' ? ` · Allergies: ${patient.allergies}` : ''}
                        {patient.bloodType !== 'UNKNOWN' ? ` · Blood ${patient.bloodType}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className={cx('text-lg font-bold tabular-nums', waitToneClass(waited))}>{waited} min</p>
                    <p className="text-[11px] text-slate-400">waiting · arrived {visit.arrivedAt ? formatClock(visit.arrivedAt) : '—'}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Suggested:
                    </span>
                    <PriorityBadge priority={suggested} escalated={visit.escalatedTo !== null} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={confirming === visit.id}
                      onClick={() => void confirm(visit)}
                    >
                      <Check className="h-4 w-4" />
                      Confirm {PRIORITY_META[suggested].label}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setOverrideFor(visit)}>
                      <SquarePen className="h-4 w-4" />
                      Override…
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {triagedToday.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Priority set</th>
                <th>Decision</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {triagedToday.map((v) => {
                const patient = patientsIndex.get(v.patientId);
                return (
                  <tr key={v.id}>
                    <td className="text-xs text-slate-500">{v.triagedAt ? formatClock(v.triagedAt) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="font-semibold text-teal-700 hover:underline"
                        onClick={() => onOpenPatient(v.patientId)}
                      >
                        {patient ? `${patient.firstName} ${patient.lastName}` : v.reference}
                      </button>
                      <div className="text-[11px] text-slate-400">{reasonLabel(v.reasonCode)}</div>
                    </td>
                    <td>
                      <PriorityBadge priority={v.priority} escalated={v.escalatedTo !== null} />
                    </td>
                    <td>
                      {v.triageState === 'OVERRIDDEN' ? (
                        <span className="pill bg-amber-50 text-amber-800 ring-1 ring-amber-200" title={v.overrideReason ?? ''}>
                          Override
                        </span>
                      ) : (
                        <span className="pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Confirmed</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{v.triagedBy ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {overrideFor ? (
        <OverrideDialog
          visit={overrideFor}
          patient={
            patientsIndex.get(overrideFor.patientId) ?? {
              id: overrideFor.patientId,
              fileNumber: '',
              idNumber: '',
              firstName: 'Patient',
              lastName: '',
              age: 0,
              gender: 'OTHER',
              phone: '',
              email: '',
              address: '',
              nextOfKinName: '',
              nextOfKinPhone: '',
              bloodType: 'UNKNOWN',
              currentMedicalStatus: '',
              pastMedicalHistory: '',
              previousMedication: '',
              allergies: '',
              consentPopia: true,
              consentedAt: null,
              completeness: 'FULL',
              registeredAt: nowIso(),
              registeredBy: '',
            }
          }
          onClose={() => setOverrideFor(null)}
          onDone={() => setOverrideFor(null)}
        />
      ) : null}
    </div>
  );
}
