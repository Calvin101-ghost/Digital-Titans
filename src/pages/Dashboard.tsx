/* Staff dashboard. Every medical professional sees the day's patients for
   their own field only. Patients are split into a priority queue (urgent +
   high) and a general queue (routine); longest waiting first in each.
   Automatic escalation is applied by the watcher in the app shell. */

import { useMemo, useState } from 'react';
import { Play, Stethoscope } from 'lucide-react';
import { db, nowIso } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useAllVisits, useConfig, useNow, usePatientsIndex } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useToast } from '../lib/toast';
import { DEPARTMENTS, departmentLabel, reasonLabel } from '../lib/catalog';
import {
  effectivePriority,
  firstContactMinutes,
  formatClock,
  formatWaiting,
  isToday,
  median,
  minutesSince,
  percent,
  sortQueue,
  urgentWithinTarget,
  waitingMinutes,
} from '../lib/logic';
import type { Department, Patient, StaffUser, Visit } from '../lib/types';
import { EmptyState, Kpi, PriorityBadge, WaitingTimer, cx, waitToneClass } from '../components/ui';
import { AdmitDialog, DischargeDialog } from '../components/flows';

export function Dashboard({
  user,
  onOpenPatient,
  onGoToTriage,
}: {
  user: StaffUser;
  onOpenPatient: (patientId: string) => void;
  onGoToTriage: () => void;
}) {
  const { can } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const now = useNow(15000);
  const visits = useAllVisits();
  const patientsIndex = usePatientsIndex();

  const seesAllDepartments = can('viewAllDepartments');
  const [deptFilter, setDeptFilter] = useState<Department | 'ALL'>('ALL');
  const activeDept: Department | 'ALL' =
    !seesAllDepartments && user.department ? user.department : deptFilter;

  const scoped = useMemo(
    () => visits.filter((v) => activeDept === 'ALL' || v.department === activeDept),
    [visits, activeDept]
  );

  const queue = useMemo(
    () => sortQueue(scoped.filter((v) => v.status === 'WAITING' && v.triageState !== 'PENDING'), now, config),
    [scoped, now, config]
  );
  const priorityQueue = queue.filter((v) => effectivePriority(v, now, config) !== 'ROUTINE');
  const generalQueue = queue.filter((v) => effectivePriority(v, now, config) === 'ROUTINE');
  const inConsultation = scoped.filter((v) => v.status === 'IN_CONSULTATION');
  const awaitingTriage = scoped.filter((v) => v.status === 'WAITING' && v.triageState === 'PENDING');

  const todayVisits = scoped.filter((v) => v.arrivedAt && isToday(v.arrivedAt, now));
  const urgentStats = urgentWithinTarget(todayVisits, config.targetUrgentMinutes);
  const contactTimes = todayVisits
    .map((v) => firstContactMinutes(v))
    .filter((n): n is number => n !== null);
  const medianContact = median(contactTimes);
  const longestWait = queue.reduce((max, v) => Math.max(max, waitingMinutes(v, now) ?? 0), 0);
  const escalationsToday = visits.filter((v) => v.escalatedTo !== null).length;

  const [admitFor, setAdmitFor] = useState<Visit | null>(null);
  const [dischargeFor, setDischargeFor] = useState<Visit | null>(null);

  const startConsultation = async (visit: Visit) => {
    const patient = patientsIndex.get(visit.patientId);
    await db.visits.update(visit.id, {
      status: 'IN_CONSULTATION',
      consultationStartedAt: nowIso(),
      consultationStartedBy: user.name,
    });
    const waited = waitingMinutes(visit, now) ?? 0;
    await logAudit(
      actorOf(user),
      'CONSULTATION_STARTED',
      'VISIT',
      visit.id,
      `Consultation started (first clinical contact) — waited ${formatWaiting(waited)}`,
      visit.patientId
    );
    push(
      `Consultation started for ${patient ? `${patient.firstName} ${patient.lastName}` : visit.reference} (waited ${formatWaiting(waited)}).`,
      'success'
    );
  };

  const canConsult = can('consult');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">
            {user.role === 'CLINICIAN' && user.department
              ? `${departmentLabel(user.department)} — today's patients`
              : "Today's patients"}
          </h1>
          <p className="text-sm text-slate-500">
            Patients within your field only · longest waiting first in each queue
          </p>
        </div>
        {seesAllDepartments ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            Field
            <select
              className="input !w-48"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value as Department | 'ALL')}
            >
              <option value="ALL">All fields</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Waiting now" value={queue.length} sub={`${inConsultation.length} in consultation`} />
        <Kpi
          label="Longest wait"
          value={formatWaiting(longestWait)}
          tone={longestWait >= 60 ? 'danger' : longestWait >= 30 ? 'warn' : 'default'}
          sub="still waiting"
        />
        <Kpi
          label={`Urgent seen ≤ ${config.targetUrgentMinutes} min`}
          value={percent(urgentStats.share)}
          tone={urgentStats.share !== null && urgentStats.share < 0.8 ? 'warn' : 'good'}
          sub={`${urgentStats.within} of ${urgentStats.seen} urgent cases today`}
        />
        <Kpi
          label="Median arrival → contact"
          value={medianContact === null ? '—' : formatWaiting(medianContact)}
          sub="today, all seen patients"
        />
        <Kpi
          label="Auto-escalated today"
          value={escalationsToday}
          tone={escalationsToday > 0 ? 'warn' : 'default'}
          sub="routine→high / high→urgent"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <span>
          Automatic escalation: routine → high after{' '}
          <strong className="text-slate-700">{config.escalationRoutineToHighMinutes} min</strong> · high → urgent
          after <strong className="text-slate-700">{config.escalationHighToUrgentMinutes} min</strong> —
          thresholds are configurable per facility (Settings).
        </span>
        {awaitingTriage.length > 0 ? (
          <span className="flex items-center gap-2">
            <span className="pill bg-amber-50 text-amber-800 ring-1 ring-amber-200">
              {awaitingTriage.length} awaiting triage
            </span>
            {can('triage') ? (
              <button type="button" className="btn btn-secondary !px-2 !py-1 text-xs" onClick={onGoToTriage}>
                <Stethoscope className="h-3.5 w-3.5" /> Go to triage
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      {inConsultation.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">In consultation</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inConsultation.map((visit) => {
              const patient = patientsIndex.get(visit.patientId);
              return (
                <div key={visit.id} className="card border-l-4 border-l-indigo-400 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-sm font-bold text-teal-700 hover:underline"
                        onClick={() => onOpenPatient(visit.patientId)}
                      >
                        {patient ? `${patient.firstName} ${patient.lastName}` : visit.reference}
                      </button>
                      <p className="text-[11px] text-slate-400">
                        {patient ? `${patient.age} yrs · ${patient.fileNumber} · ` : ''}
                        {departmentLabel(visit.department)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{reasonLabel(visit.reasonCode)}</p>
                    </div>
                    <PriorityBadge priority={effectivePriority(visit, now, config)} escalated={visit.escalatedTo !== null} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    In consultation for{' '}
                    {visit.consultationStartedAt ? (
                      <WaitingTimer from={visit.consultationStartedAt} className="font-semibold text-indigo-700" />
                    ) : (
                      '—'
                    )}{' '}
                    (arrived {visit.arrivedAt ? formatClock(visit.arrivedAt) : '—'})
                  </p>
                  {canConsult ? (
                    <div className="mt-3 flex gap-2">
                      <button type="button" className="btn btn-primary !px-2.5 !py-1.5 text-xs" onClick={() => setAdmitFor(visit)}>
                        Admit…
                      </button>
                      <button type="button" className="btn btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => setDischargeFor(visit)}>
                        Discharge
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Priority queue
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
              {priorityQueue.length}
            </span>
          </h2>
          {priorityQueue.length === 0 ? (
            <EmptyState title="No urgent or high-priority patients waiting" />
          ) : (
            <div className="space-y-2.5">
              {priorityQueue.map((visit) => (
                <QueueCard
                  key={visit.id}
                  visit={visit}
                  patient={patientsIndex.get(visit.patientId)}
                  now={now}
                  config={config}
                  showDepartment={activeDept === 'ALL'}
                  canConsult={canConsult}
                  onOpenPatient={onOpenPatient}
                  onStart={() => void startConsultation(visit)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            General queue
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
              {generalQueue.length}
            </span>
          </h2>
          {generalQueue.length === 0 ? (
            <EmptyState title="No routine patients waiting" />
          ) : (
            <div className="space-y-2.5">
              {generalQueue.map((visit) => (
                <QueueCard
                  key={visit.id}
                  visit={visit}
                  patient={patientsIndex.get(visit.patientId)}
                  now={now}
                  config={config}
                  showDepartment={activeDept === 'ALL'}
                  canConsult={canConsult}
                  onOpenPatient={onOpenPatient}
                  onStart={() => void startConsultation(visit)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {admitFor ? (
        <AdmitDialog
          visit={admitFor}
          patient={fallbackPatient(admitFor, patientsIndex)}
          onClose={() => setAdmitFor(null)}
          onDone={() => setAdmitFor(null)}
        />
      ) : null}

      {dischargeFor ? (
        <DischargeDialog
          visit={dischargeFor}
          patient={fallbackPatient(dischargeFor, patientsIndex)}
          onClose={() => setDischargeFor(null)}
          onDone={() => setDischargeFor(null)}
        />
      ) : null}
    </div>
  );
}

function QueueCard({
  visit,
  patient,
  now,
  config,
  showDepartment,
  canConsult,
  onOpenPatient,
  onStart,
}: {
  visit: Visit;
  patient: Patient | undefined;
  now: Date;
  config: { escalationRoutineToHighMinutes: number; escalationHighToUrgentMinutes: number };
  showDepartment: boolean;
  canConsult: boolean;
  onOpenPatient: (id: string) => void;
  onStart: () => void;
}) {
  const effective = effectivePriority(visit, now, config);
  const waited = visit.arrivedAt ? minutesSince(visit.arrivedAt, now) : 0;
  const escalated = visit.escalatedTo !== null;

  return (
    <div
      className={cx(
        'card p-3.5',
        effective === 'URGENT' ? 'border-l-4 border-l-red-500' : escalated ? 'border-l-4 border-l-amber-400' : ''
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="truncate text-sm font-bold text-teal-700 hover:underline"
              onClick={() => onOpenPatient(visit.patientId)}
            >
              {patient ? `${patient.firstName} ${patient.lastName}` : visit.reference}
            </button>
            <PriorityBadge priority={effective} escalated={escalated} />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {patient ? `${patient.age} yrs · ${patient.gender.toLowerCase()} · ${patient.fileNumber}` : ''}
            {showDepartment ? ` · ${departmentLabel(visit.department)}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-600">{reasonLabel(visit.reasonCode)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cx('text-lg font-bold tabular-nums', waitToneClass(waited))}>
            <WaitingTimer from={visit.arrivedAt ?? visit.createdAt} className="!font-bold" />
          </p>
          <p className="text-[11px] text-slate-400">
            waiting · arrived {visit.arrivedAt ? formatClock(visit.arrivedAt) : '—'}
          </p>
        </div>
      </div>
      {escalated ? (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Auto-escalated to {visit.escalatedTo} after a long wait — no longer in the {visit.escalatedTo === 'HIGH' ? 'general' : 'high'} queue.
        </p>
      ) : null}
      {canConsult ? (
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn btn-primary !px-3 !py-1.5 text-xs" onClick={onStart}>
            <Play className="h-3.5 w-3.5" />
            Start consultation
          </button>
        </div>
      ) : null}
    </div>
  );
}

function fallbackPatient(visit: Visit, index: Map<string, Patient>): Patient {
  return (
    index.get(visit.patientId) ?? {
      id: visit.patientId,
      fileNumber: '',
      idNumber: '',
      firstName: 'Patient',
      lastName: visit.reference,
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
  );
}
