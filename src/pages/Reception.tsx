/* Reception desk: find returning patients by ID number (nothing captured
   twice), register first-time patients, manage pre-registrations and see
   today's arrivals. */

import { useMemo, useState } from 'react';
import { Search, Send, UserPlus } from 'lucide-react';
import { db, nowIso } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useAllVisits, useConfig, useNow, usePatientsIndex } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useToast } from '../lib/toast';
import { departmentLabel, reasonLabel } from '../lib/catalog';
import { effectivePriority, estimateWait, formatClock, formatDay, formatWaiting, isToday, maskIdNumber } from '../lib/logic';
import type { Patient, Visit } from '../lib/types';
import { EmptyState, Modal, PriorityBadge, SmsBubble, StatusBadge, Tabs, WaitingTimer, cx } from '../components/ui';
import { PatientForm, VisitDialog, WaitingSlip } from '../components/flows';

type Tab = 'find' | 'prereg' | 'today';

export function Reception({ onOpenPatient }: { onOpenPatient: (patientId: string) => void }) {
  const { user } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const now = useNow(15000);
  const visits = useAllVisits();
  const patientsIndex = usePatientsIndex();

  const [tab, setTab] = useState<Tab>('find');
  const [search, setSearch] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [visitFor, setVisitFor] = useState<Patient | null>(null);
  const [slip, setSlip] = useState<{ visit: Visit; patient: Patient } | null>(null);
  const [reminderFor, setReminderFor] = useState<Visit | null>(null);

  const patients = useMemo(() => [...patientsIndex.values()], [patientsIndex]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return patients
      .filter((p) => {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return (
          p.idNumber.toLowerCase().includes(q) ||
          p.fileNumber.toLowerCase().includes(q) ||
          name.includes(q) ||
          p.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        );
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .slice(0, 8);
  }, [patients, search]);

  const preRegistrations = useMemo(
    () =>
      visits
        .filter((v) => v.status === 'SCHEDULED')
        .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')),
    [visits]
  );

  const arrivalsToday = useMemo(
    () =>
      visits
        .filter((v) => v.arrivedAt && isToday(v.arrivedAt, now))
        .sort((a, b) => (b.arrivedAt ?? '').localeCompare(a.arrivedAt ?? '')),
    [visits, now]
  );

  const markArrived = async (visit: Visit) => {
    if (!user) return;
    const patient = patientsIndex.get(visit.patientId);
    await db.visits.update(visit.id, { status: 'WAITING', arrivedAt: nowIso() });
    await logAudit(
      actorOf(user),
      'ARRIVAL_MARKED',
      'VISIT',
      visit.id,
      `Arrival marked at reception (ref ${visit.reference})`,
      visit.patientId
    );
    push(
      `${patient ? patient.firstName : 'Patient'} marked as arrived — now waiting for triage.`,
      'success'
    );
  };

  const waitingCount = visits.filter((v) => v.status === 'WAITING').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Reception desk</h1>
          <p className="text-sm text-slate-500">
            {waitingCount} patient{waitingCount === 1 ? '' : 's'} currently waiting · pilot facility
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowRegister(true)}>
          <UserPlus className="h-4 w-4" />
          Register new patient
        </button>
      </div>

      <Tabs<Tab>
        tabs={[
          { value: 'find', label: 'Find / register patient' },
          { value: 'prereg', label: 'Pre-registrations', count: preRegistrations.length },
          { value: 'today', label: "Today's arrivals", count: arrivalsToday.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'find' ? (
        <div className="space-y-4">
          <div className="card p-4">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Find a returning patient — ID number, file number, name or phone
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input !pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. 9203155800083"
                autoFocus
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              One record per patient, found by ID number: the existing profile opens and nothing is captured
              twice.
            </p>
          </div>

          {search.trim().length >= 2 ? (
            results.length === 0 ? (
              <EmptyState
                title="No record found for this search"
                hint="If this is a first-time patient, use “Register new patient”."
              />
            ) : (
              <div className="card overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File no.</th>
                      <th>Patient</th>
                      <th>ID number</th>
                      <th>Phone</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.fileNumber}</td>
                        <td>
                          <button
                            type="button"
                            className="font-semibold text-teal-700 hover:underline"
                            onClick={() => onOpenPatient(p.id)}
                          >
                            {p.firstName} {p.lastName}
                          </button>
                          <div className="text-[11px] text-slate-400">
                            {p.age} yrs · {p.gender.toLowerCase()}
                            {p.completeness === 'PRE_REGISTRATION' ? ' · pre-registration to complete' : ''}
                          </div>
                        </td>
                        <td className="font-mono text-xs text-slate-500">{maskIdNumber(p.idNumber)}</td>
                        <td className="text-xs text-slate-500">{p.phone}</td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              className="btn btn-secondary !px-2 !py-1 text-xs"
                              onClick={() => onOpenPatient(p.id)}
                            >
                              Open record
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary !px-2 !py-1 text-xs"
                              onClick={() => setVisitFor(p)}
                            >
                              New visit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Records on file</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{patients.length}</p>
              </div>
              <div className="card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Waiting now</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{waitingCount}</p>
              </div>
              <div className="card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pre-registered</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{preRegistrations.length}</p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'prereg' ? (
        preRegistrations.length === 0 ? (
          <EmptyState
            title="No pre-registrations waiting"
            hint="Patients who pre-register through the kiosk appear here with their estimated arrival time."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Patient</th>
                  <th>Reason</th>
                  <th>Arrive around</th>
                  <th>Suggested</th>
                  <th>Est. wait now</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {preRegistrations.map((v) => {
                  const patient = patientsIndex.get(v.patientId);
                  const estimate = estimateWait(v.department, visits, now, config);
                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-xs">{v.reference}</td>
                      <td>
                        <button
                          type="button"
                          className="font-semibold text-teal-700 hover:underline"
                          onClick={() => onOpenPatient(v.patientId)}
                        >
                          {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                        </button>
                        <div className="text-[11px] text-slate-400">{departmentLabel(v.department)}</div>
                      </td>
                      <td className="text-xs text-slate-600">{reasonLabel(v.reasonCode)}</td>
                      <td className="text-xs">
                        {v.scheduledFor ? (
                          <>
                            {formatClock(v.scheduledFor)}
                            <span className="block text-[11px] text-slate-400">{formatDay(v.scheduledFor)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <PriorityBadge priority={v.suggestedPriority} />
                      </td>
                      <td className="text-xs tabular-nums text-slate-600">~{formatWaiting(estimate.minutes)}</td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn btn-secondary !px-2 !py-1 text-xs"
                            onClick={() => setReminderFor(v)}
                          >
                            <Send className="h-3.5 w-3.5" /> SMS
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary !px-2 !py-1 text-xs"
                            onClick={() => void markArrived(v)}
                          >
                            Mark arrived
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === 'today' ? (
        arrivalsToday.length === 0 ? (
          <EmptyState title="No arrivals yet today" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Patient</th>
                  <th>Field</th>
                  <th>Reason</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Waiting</th>
                </tr>
              </thead>
              <tbody>
                {arrivalsToday.map((v) => {
                  const patient = patientsIndex.get(v.patientId);
                  const priority = effectivePriority(v, now, config);
                  const active = v.status === 'WAITING' || v.status === 'IN_CONSULTATION';
                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-xs">{v.reference}</td>
                      <td>
                        <button
                          type="button"
                          className="font-semibold text-teal-700 hover:underline"
                          onClick={() => onOpenPatient(v.patientId)}
                        >
                          {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                        </button>
                        <div className="text-[11px] text-slate-400">
                          {patient ? `${patient.age} yrs · ${patient.gender.toLowerCase()}` : ''}
                        </div>
                      </td>
                      <td className="text-xs text-slate-600">{departmentLabel(v.department)}</td>
                      <td className="text-xs text-slate-600">{reasonLabel(v.reasonCode)}</td>
                      <td>
                        <PriorityBadge priority={priority} escalated={v.escalatedTo !== null} />
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={v.status} />
                          {v.triageState === 'PENDING' && v.status === 'WAITING' ? (
                            <span className="pill bg-slate-100 text-slate-500 ring-1 ring-slate-200">awaiting triage</span>
                          ) : null}
                        </div>
                      </td>
                      <td className={cx('text-xs', active ? 'text-slate-700' : 'text-slate-400')}>
                        {v.arrivedAt && active ? <WaitingTimer from={v.arrivedAt} /> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {showRegister ? (
        <Modal title="Register new patient" subtitle="First-time patients get a digital record on this device." onClose={() => setShowRegister(false)} wide>
          <PatientForm
            mode="create"
            onCancel={() => setShowRegister(false)}
            onFoundExisting={(existing) => {
              setShowRegister(false);
              onOpenPatient(existing.id);
            }}
            onSaved={(patient) => {
              setShowRegister(false);
              setVisitFor(patient);
            }}
          />
        </Modal>
      ) : null}

      {visitFor ? (
        <VisitDialog
          patient={visitFor}
          onClose={() => setVisitFor(null)}
          onDone={(visit) => {
            const patient = visitFor;
            setVisitFor(null);
            setSlip({ visit, patient });
          }}
        />
      ) : null}

      {slip ? <WaitingSlip visit={slip.visit} patient={slip.patient} onClose={() => setSlip(null)} /> : null}

      {reminderFor ? (
        <ReminderModal visit={reminderFor} onClose={() => setReminderFor(null)} />
      ) : null}
    </div>
  );
}

function ReminderModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { user } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const visits = useAllVisits();
  const now = useNow(30000);
  const patientsIndex = usePatientsIndex();
  const [sent, setSent] = useState(false);

  const patient = patientsIndex.get(visit.patientId);
  const estimate = estimateWait(visit.department, visits, now, config);
  const text = `BEYOND THE QUEUE — ${config.name}: Reminder for ${patient?.firstName ?? 'you'}, ref ${visit.reference} (${departmentLabel(visit.department)}). Estimated wait from arrival is now ~${estimate.minutes} min. Please arrive around ${visit.scheduledFor ? formatClock(visit.scheduledFor) : 'your booked time'}. Show this SMS at reception.`;

  const send = async () => {
    if (!user || !patient) return;
    setSent(true);
    await logAudit(
      actorOf(user),
      'SMS_SENT',
      'VISIT',
      visit.id,
      `Pre-registration reminder SMS to ${patient.phone} (ref ${visit.reference})`,
      patient.id
    );
    push('Reminder SMS queued through the gateway (simulated).', 'success');
    onClose();
  };

  return (
    <Modal
      title="Send pre-registration reminder"
      subtitle={patient ? `${patient.firstName} ${patient.lastName} · ${patient.phone}` : visit.reference}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={sent}>
            <Send className="h-4 w-4" />
            {sent ? 'SMS queued' : 'Send SMS'}
          </button>
        </>
      }
    >
      <SmsBubble text={text} />
    </Modal>
  );
}
