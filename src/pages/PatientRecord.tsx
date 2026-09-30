/* The full digital record for one patient: demographics, clinical summary
   (restricted to clinical staff), visit history and the audit trail for
   this record. Opening the record is itself a logged action. */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Lock, Plus, SquarePen } from 'lucide-react';
import { db } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useConfig, useNow } from '../lib/hooks';
import { AUDIT_LABEL, auditBadge, logAudit, logRecordView } from '../lib/audit';
import { departmentLabel, reasonLabel } from '../lib/catalog';
import {
  effectivePriority,
  firstContactMinutes,
  formatDateTime,
  formatWaiting,
  waitingMinutes,
} from '../lib/logic';
import type { AuditEntry, Visit } from '../lib/types';
import { Chip, EmptyState, InfoRow, MaskedId, Modal, PriorityBadge, SectionTitle, StatusBadge, Tabs, WaitingTimer } from '../components/ui';
import { PatientForm, VisitDialog, WaitingSlip } from '../components/flows';

type Tab = 'overview' | 'visits' | 'audit';

export function PatientRecord({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const { user, can } = useAuth();
  const config = useConfig();
  const now = useNow(15000);

  const [tab, setTab] = useState<Tab>('overview');
  const [showComplete, setShowComplete] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [slip, setSlip] = useState<Visit | null>(null);

  const patient = useLiveQuery(() => db.patients.get(patientId), [patientId]);
  const visits = useLiveQuery(
    () => db.visits.where('patientId').equals(patientId).toArray(),
    [patientId],
    [] as Visit[]
  );
  const auditEntries = useLiveQuery(
    async () => {
      const rows = await db.audit.where('patientId').equals(patientId).toArray();
      return rows.sort((a, b) => b.at.localeCompare(a.at));
    },
    [patientId],
    [] as AuditEntry[]
  );

  useEffect(() => {
    if (user && patient) {
      void logRecordView(actorOf(user), patient.id, `${patient.firstName} ${patient.lastName}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, patient?.id]);

  const sortedVisits = useMemo(
    () =>
      [...visits].sort((a, b) =>
        (b.arrivedAt ?? b.createdAt).localeCompare(a.arrivedAt ?? a.createdAt)
      ),
    [visits]
  );

  if (!patient) {
    return <EmptyState title="Record not found" hint="The record may not exist on this device." />;
  }

  const activeVisit = visits.find(
    (v) => v.status === 'SCHEDULED' || v.status === 'WAITING' || v.status === 'IN_CONSULTATION' || v.status === 'ADMITTED'
  );
  const clinical = can('viewClinical');

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'visits', label: 'Visits', count: visits.length },
  ];
  if (can('viewAudit')) tabs.push({ value: 'audit', label: 'Audit trail', count: auditEntries.length });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button type="button" className="btn btn-secondary !px-2.5" onClick={onBack} title="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-slate-500">
              {patient.fileNumber} · {patient.age} yrs · {patient.gender.toLowerCase()} · registered{' '}
              {formatDateTime(patient.registeredAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {patient.completeness === 'PRE_REGISTRATION' ? (
            <Chip className="bg-cyan-50 text-cyan-700 ring-cyan-200">Pre-registration — completes at reception</Chip>
          ) : null}
          {patient.completeness === 'PRE_REGISTRATION' && can('register') ? (
            <button type="button" className="btn btn-secondary" onClick={() => setShowComplete(true)}>
              <SquarePen className="h-4 w-4" />
              Complete registration
            </button>
          ) : null}
          {can('register') && !activeVisit ? (
            <button type="button" className="btn btn-primary" onClick={() => setShowVisit(true)}>
              <Plus className="h-4 w-4" />
              New visit
            </button>
          ) : null}
        </div>
      </div>

      {activeVisit ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-teal-500 p-3.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active visit</span>
            <span className="font-mono text-xs text-slate-500">{activeVisit.reference}</span>
            <StatusBadge status={activeVisit.status} />
            <PriorityBadge
              priority={effectivePriority(activeVisit, now, config)}
              escalated={activeVisit.escalatedTo !== null}
            />
            <span className="text-xs text-slate-500">
              {reasonLabel(activeVisit.reasonCode)} · {departmentLabel(activeVisit.department)}
            </span>
          </div>
          {activeVisit.arrivedAt && (activeVisit.status === 'WAITING' || activeVisit.status === 'IN_CONSULTATION') ? (
            <span className="text-xs text-slate-500">
              Waiting: <WaitingTimer from={activeVisit.arrivedAt} className="font-semibold" />
            </span>
          ) : null}
        </div>
      ) : null}

      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <SectionTitle>Identity &amp; contact</SectionTitle>
            <InfoRow
              label="ID number"
              value={
                <MaskedId
                  value={patient.idNumber}
                  canReveal={can('revealId')}
                  onReveal={() => {
                    if (user) {
                      void logAudit(
                        actorOf(user),
                        'ID_REVEALED',
                        'PATIENT',
                        patient.id,
                        `Revealed full ID number for ${patient.firstName} ${patient.lastName}`,
                        patient.id
                      );
                    }
                  }}
                />
              }
            />
            <InfoRow label="File number" value={patient.fileNumber} />
            <InfoRow label="Phone" value={patient.phone} />
            <InfoRow label="Email" value={patient.email} />
            <InfoRow label="Address" value={patient.address} />
            <InfoRow
              label="Next of kin"
              value={[patient.nextOfKinName, patient.nextOfKinPhone].filter(Boolean).join(' · ')}
            />
            <InfoRow
              label="POPIA consent"
              value={
                patient.consentPopia ? (
                  <span className="pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    Given {patient.consentedAt ? formatDateTime(patient.consentedAt) : ''}
                  </span>
                ) : (
                  <span className="pill bg-red-50 text-red-700 ring-1 ring-red-200">Not on file</span>
                )
              }
            />
          </div>

          {clinical ? (
            <div className="card p-4">
              <SectionTitle>Clinical summary</SectionTitle>
              <InfoRow
                label="Blood type"
                value={patient.bloodType === 'UNKNOWN' ? 'Unknown / not tested' : patient.bloodType}
              />
              <InfoRow label="Current status" value={patient.currentMedicalStatus} />
              <InfoRow label="Allergies" value={patient.allergies} />
              <InfoRow label="Past medical history" value={patient.pastMedicalHistory} />
              <InfoRow label="Previous medication" value={patient.previousMedication} />
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center gap-2 p-8 text-center">
              <Lock className="h-5 w-5 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Clinical details restricted</p>
              <p className="text-xs text-slate-400">
                Least-privilege access: health details are only visible to clinical staff. This access rule
                itself is part of the POPIA design.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'visits' ? (
        sortedVisits.length === 0 ? (
          <EmptyState title="No visits yet" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref</th>
                  <th>Reason / field</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Arrival → first contact</th>
                  <th>Seen by</th>
                </tr>
              </thead>
              <tbody>
                {sortedVisits.map((v) => {
                  const contact = firstContactMinutes(v);
                  const waitingNow = (v.status === 'WAITING' || v.status === 'IN_CONSULTATION') && v.arrivedAt;
                  return (
                    <tr key={v.id}>
                      <td className="text-xs text-slate-500">
                        {formatDateTime(v.arrivedAt ?? v.createdAt)}
                      </td>
                      <td className="font-mono text-xs">{v.reference}</td>
                      <td className="text-xs text-slate-600">
                        {reasonLabel(v.reasonCode)}
                        <div className="text-[11px] text-slate-400">{departmentLabel(v.department)}</div>
                      </td>
                      <td>
                        <PriorityBadge priority={v.priority} escalated={v.escalatedTo !== null} />
                      </td>
                      <td>
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="text-xs tabular-nums text-slate-600">
                        {contact !== null
                          ? `${formatWaiting(contact)}`
                          : waitingNow && v.arrivedAt
                            ? `waiting ${formatWaiting(waitingMinutes(v, now) ?? 0)}`
                            : '—'}
                      </td>
                      <td className="text-xs text-slate-500">{v.consultationStartedBy ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === 'audit' ? (
        auditEntries.length === 0 ? (
          <EmptyState title="No audit entries for this record yet" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time-stamped</th>
                  <th>Action</th>
                  <th>By</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-xs tabular-nums text-slate-500">
                      {formatDateTime(entry.at)}
                    </td>
                    <td>
                      <span className={`pill ${auditBadge(entry.action)}`}>{AUDIT_LABEL[entry.action]}</span>
                    </td>
                    <td className="text-xs text-slate-600">
                      {entry.actorName}
                      <div className="text-[11px] text-slate-400">{entry.actorRole.toLowerCase()}</div>
                    </td>
                    <td className="text-xs text-slate-600">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {showComplete ? (
        <Modal
          title="Complete registration"
          subtitle={`${patient.firstName} ${patient.lastName} · ${patient.fileNumber}`}
          onClose={() => setShowComplete(false)}
          wide
        >
          <PatientForm
            mode="complete"
            initial={patient}
            onCancel={() => setShowComplete(false)}
            onSaved={() => setShowComplete(false)}
          />
        </Modal>
      ) : null}

      {showVisit ? (
        <VisitDialog
          patient={patient}
          onClose={() => setShowVisit(false)}
          onDone={(visit) => {
            setShowVisit(false);
            setSlip(visit);
          }}
        />
      ) : null}

      {slip ? <WaitingSlip visit={slip} patient={patient} onClose={() => setSlip(null)} /> : null}
    </div>
  );
}
