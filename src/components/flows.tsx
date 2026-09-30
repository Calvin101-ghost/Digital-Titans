/* Multi-step dialog flows shared across pages: patient registration /
   completion, creating a visit, the waiting-slip with the simulated SMS,
   triage override, admission and discharge. Every action writes an audit
   entry attributed to the signed-in staff member. */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BedDouble, Plus, Send, Trash } from 'lucide-react';
import { db, nextFileNumber, nowIso, uid } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useAllVisits, useConfig, useNow } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useToast } from '../lib/toast';
import {
  BLOOD_TYPES,
  GENDERS,
  PRIORITY_META,
  REASONS,
  WARDS,
  departmentLabel,
  reasonByCode,
} from '../lib/catalog';
import { deriveAgeFromId, deriveGenderFromId, estimateWait, formatWaiting } from '../lib/logic';
import type {
  Admission,
  BloodType,
  Gender,
  MedicationOrder,
  Patient,
  Priority,
  Visit,
} from '../lib/types';
import { Field, Modal, PriorityBadge, SmsBubble, cx } from './ui';

function makeReference(): string {
  return `V-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/* ------------------------------------------------------ patient forms -- */

interface PatientFormProps {
  initial?: Patient | null;
  mode: 'create' | 'complete';
  onSaved: (patient: Patient) => void;
  onCancel?: () => void;
  onFoundExisting?: (patient: Patient) => void;
}

export function PatientForm({ initial, mode, onSaved, onCancel, onFoundExisting }: PatientFormProps) {
  const { user } = useAuth();
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(() => ({
    idNumber: initial?.idNumber ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    age: initial ? String(initial.age) : '',
    gender: (initial?.gender ?? 'FEMALE') as Gender,
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    nextOfKinName: initial?.nextOfKinName ?? '',
    nextOfKinPhone: initial?.nextOfKinPhone ?? '',
    bloodType: (initial?.bloodType ?? 'UNKNOWN') as BloodType,
    currentMedicalStatus: initial?.currentMedicalStatus ?? 'Stable',
    pastMedicalHistory: initial?.pastMedicalHistory ?? '',
    previousMedication: initial?.previousMedication ?? '',
    allergies: initial?.allergies ?? '',
    consent: mode === 'complete',
  }));

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const trimmedId = form.idNumber.trim();
  const existing = useLiveQuery(async () => {
    if (trimmedId.length < 6) return undefined;
    return db.patients.where('idNumber').equals(trimmedId).first();
  }, [trimmedId]);
  const duplicate = mode === 'create' && existing && existing.id !== initial?.id ? existing : undefined;

  const onIdChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, idNumber: value };
      const age = deriveAgeFromId(value, new Date());
      const gender = deriveGenderFromId(value);
      if (age !== null) next.age = String(age);
      if (gender) next.gender = gender;
      return next;
    });
  };

  const validate = (): string | null => {
    if (trimmedId.length < 6) return 'An ID number (or passport number) of at least 6 characters is required.';
    if (duplicate) return 'This ID number already has a record. Open the existing record instead.';
    if (!form.firstName.trim() || !form.lastName.trim()) return 'First and last name are required.';
    if (!form.phone.trim()) return 'A contact number is required.';
    const age = Number(form.age);
    if (form.age === '' || Number.isNaN(age) || age < 0 || age > 120) return 'Enter a valid age (0–120).';
    if (mode === 'create' && !form.consent) return 'POPIA consent is required before storing health information.';
    return null;
  };

  const save = async () => {
    if (!user) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const base = {
        idNumber: trimmedId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        age: Number(form.age),
        gender: form.gender,
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        nextOfKinName: form.nextOfKinName.trim(),
        nextOfKinPhone: form.nextOfKinPhone.trim(),
        bloodType: form.bloodType,
        currentMedicalStatus: form.currentMedicalStatus.trim(),
        pastMedicalHistory: form.pastMedicalHistory.trim(),
        previousMedication: form.previousMedication.trim(),
        allergies: form.allergies.trim(),
      };
      if (mode === 'create') {
        const patient: Patient = {
          id: uid('p'),
          fileNumber: await nextFileNumber(),
          ...base,
          consentPopia: true,
          consentedAt: nowIso(),
          completeness: 'FULL',
          registeredAt: nowIso(),
          registeredBy: user.name,
        };
        await db.patients.add(patient);
        await logAudit(
          actorOf(user),
          'PATIENT_CREATED',
          'PATIENT',
          patient.id,
          `Registered ${patient.firstName} ${patient.lastName} (${patient.fileNumber})`,
          patient.id
        );
        push(`${patient.firstName} ${patient.lastName} registered as ${patient.fileNumber}.`, 'success');
        onSaved(patient);
      } else if (initial) {
        const updated: Patient = { ...initial, ...base, completeness: 'FULL' };
        await db.patients.put(updated);
        await logAudit(
          actorOf(user),
          'PATIENT_UPDATED',
          'PATIENT',
          initial.id,
          `Completed registration for ${updated.firstName} ${updated.lastName}`,
          initial.id
        );
        push('Record updated.', 'success');
        onSaved(updated);
      }
    } finally {
      setSaving(false);
    }
  };

  const idDerived =
    mode === 'create' && form.idNumber.trim().length === 13 && deriveAgeFromId(form.idNumber.trim(), new Date()) !== null;

  return (
    <div className="space-y-5">
      {mode === 'complete' ? (
        <p className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-800 ring-1 ring-sky-200">
          This record was created from kiosk pre-registration. Complete the missing details face to face at
          reception — the patient's history and existing visit stay linked to the same file.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="ID number (SA ID or passport)"
            required
            hint={idDerived ? 'Age and gender were derived from the ID number — correct them if needed.' : 'Used to find the patient on every future visit.'}
          >
            <input className="input font-mono" value={form.idNumber} onChange={(e) => onIdChange(e.target.value)} placeholder="e.g. 9203155800083" />
          </Field>
          {duplicate ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
              <span>
                This ID already belongs to <strong>{duplicate.firstName} {duplicate.lastName}</strong> ({duplicate.fileNumber}, {duplicate.age} yrs).
              </span>
              {onFoundExisting ? (
                <button type="button" className="btn btn-secondary !px-2 !py-1 text-xs" onClick={() => onFoundExisting(duplicate)}>
                  Open existing record
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Field label="First name" required>
          <input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </Field>
        <Field label="Last name" required>
          <input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age" required>
            <input className="input" inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value)} />
          </Field>
          <Field label="Gender">
            <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
              {GENDERS.map((g) => (
                <option key={g.code} value={g.code}>{g.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Blood type">
          <select className="input" value={form.bloodType} onChange={(e) => set('bloodType', e.target.value as BloodType)}>
            {BLOOD_TYPES.map((t) => (
              <option key={t} value={t}>{t === 'UNKNOWN' ? 'Unknown / not tested' : t}</option>
            ))}
          </select>
        </Field>

        <Field label="Contact number" required>
          <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="072 000 0000" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Home address">
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>

        <Field label="Next of kin">
          <input className="input" value={form.nextOfKinName} onChange={(e) => set('nextOfKinName', e.target.value)} placeholder="Name and relationship" />
        </Field>
        <Field label="Next of kin contact">
          <input className="input" value={form.nextOfKinPhone} onChange={(e) => set('nextOfKinPhone', e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Current medical status">
            <input className="input" value={form.currentMedicalStatus} onChange={(e) => set('currentMedicalStatus', e.target.value)} placeholder="e.g. stable, critical, pregnant, wheelchair" />
          </Field>
        </div>
        <Field label="Past medical history">
          <textarea className="input min-h-20" value={form.pastMedicalHistory} onChange={(e) => set('pastMedicalHistory', e.target.value)} placeholder="Conditions, operations, previous admissions" />
        </Field>
        <Field label="Previous medication">
          <textarea className="input min-h-20" value={form.previousMedication} onChange={(e) => set('previousMedication', e.target.value)} placeholder="Name and dose of current medication" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Allergies">
            <input className="input" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="None known" />
          </Field>
        </div>
      </div>

      {mode === 'create' ? (
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-teal-700"
            checked={form.consent}
            onChange={(e) => set('consent', e.target.checked)}
          />
          <span className="text-xs text-slate-600">
            The patient consents to their personal and health information being collected, stored and
            processed for their care, in line with POPIA (Protection of Personal Information Act). Required
            before health data is stored.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !!duplicate}>
          {mode === 'create' ? 'Save patient record' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- visits -- */

export function VisitDialog({
  patient,
  onDone,
  onClose,
}: {
  patient: Patient;
  onDone: (visit: Visit) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const visits = useAllVisits();
  const [reasonCode, setReasonCode] = useState('');
  const [busy, setBusy] = useState(false);

  const reason = reasonCode ? reasonByCode(reasonCode) : undefined;
  const activeVisit = useMemo(
    () =>
      visits.find(
        (v) =>
          v.patientId === patient.id &&
          (v.status === 'WAITING' || v.status === 'IN_CONSULTATION' || v.status === 'ADMITTED')
      ),
    [visits, patient.id]
  );

  const create = async () => {
    if (!user || !reason) return;
    setBusy(true);
    try {
      const visit: Visit = {
        id: uid('v'),
        reference: makeReference(),
        patientId: patient.id,
        department: reason.department,
        reasonCode: reason.code,
        suggestedPriority: reason.priority,
        priority: reason.priority,
        escalatedTo: null,
        escalatedAt: null,
        triageState: 'PENDING',
        overrideReason: null,
        status: 'WAITING',
        scheduledFor: null,
        arrivedAt: nowIso(),
        triagedAt: null,
        triagedBy: null,
        consultationStartedAt: null,
        consultationStartedBy: null,
        admittedAt: null,
        dischargedAt: null,
        admissionId: null,
        createdAt: nowIso(),
        createdBy: user.name,
      };
      await db.visits.add(visit);
      await logAudit(
        actorOf(user),
        'VISIT_CREATED',
        'VISIT',
        visit.id,
        `Visit created — ${reason.label} (${departmentLabel(reason.department)})`,
        patient.id
      );
      push(`${patient.firstName} added to the ${departmentLabel(reason.department)} queue.`, 'success');
      onDone(visit);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New visit"
      subtitle={`${patient.firstName} ${patient.lastName} · ${patient.fileNumber} · ${patient.age} yrs`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!reason || busy || !!activeVisit}
            onClick={() => void create()}
          >
            Add to queue
          </button>
        </>
      }
    >
      {activeVisit ? (
        <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          This patient already has an active visit ({activeVisit.reference}, status: {activeVisit.status.toLowerCase().replace('_', ' ')}).
          Close that visit before creating another.
        </p>
      ) : null}

      <Field label="Reason for visit" required hint="Chosen from the fixed categories agreed with clinical staff.">
        <select className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          <option value="" disabled>
            Select a reason…
          </option>
          {REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label} — suggested: {PRIORITY_META[r.priority].label}
            </option>
          ))}
        </select>
      </Field>

      {reason ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Suggested priority:</span>
            <PriorityBadge priority={reason.priority} />
            <span className="text-xs text-slate-500">· field:</span>
            <span className="text-xs font-semibold text-slate-700">{departmentLabel(reason.department)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {PRIORITY_META[reason.priority].blurb} A triage nurse confirms the priority before the patient is
            queued — patients never set their own priority.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function smsText(patient: Patient, visit: Visit, waitMinutes: number, facilityName: string): string {
  return (
    `BEYOND THE QUEUE — ${facilityName}: Hi ${patient.firstName}, you are pre-registered ` +
    `(ref ${visit.reference}) in the ${departmentLabel(visit.department)} queue. ` +
    `Estimated wait ~${waitMinutes} min. Show this SMS at reception.`
  );
}

export function WaitingSlip({
  visit,
  patient,
  onClose,
}: {
  visit: Visit;
  patient: Patient;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const config = useConfig();
  const visits = useAllVisits();
  const now = useNow(30000);
  const [sent, setSent] = useState(false);

  const estimate = estimateWait(visit.department, visits, now, config);
  const text = smsText(patient, visit, estimate.minutes, config.name);

  const sendSms = async () => {
    if (!user) return;
    setSent(true);
    await logAudit(
      actorOf(user),
      'SMS_SENT',
      'VISIT',
      visit.id,
      `Estimated-wait SMS to ${patient.phone} (ref ${visit.reference}, ~${estimate.minutes} min)`,
      patient.id
    );
    push('SMS queued through the gateway (simulated).', 'success');
  };

  return (
    <Modal
      title="Patient added to the queue"
      subtitle={`${patient.firstName} ${patient.lastName} · ${patient.fileNumber}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void sendSms()} disabled={sent}>
            <Send className="h-4 w-4" />
            {sent ? 'SMS queued' : 'Send estimated-wait SMS'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Reference</p>
          <p className="text-sm font-bold text-slate-800">{visit.reference}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Position</p>
          <p className="text-sm font-bold text-slate-800">{estimate.position}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Est. wait</p>
          <p className="text-sm font-bold text-slate-800">{formatWaiting(estimate.minutes)}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Estimate based on the current {departmentLabel(visit.department)} queue. Urgent cases are never
        delayed by pre-registration.
      </p>
      <SmsBubble text={text} />
    </Modal>
  );
}

/* ------------------------------------------------------------- triage -- */

export function OverrideDialog({
  visit,
  patient,
  onDone,
  onClose,
}: {
  visit: Visit;
  patient: Patient;
  onDone: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const [priority, setPriority] = useState<Priority>(visit.priority);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const priorities: Priority[] = ['URGENT', 'HIGH', 'ROUTINE'];

  const save = async () => {
    if (!user || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await db.visits.update(visit.id, {
        priority,
        triageState: priority === visit.suggestedPriority ? 'CONFIRMED' : 'OVERRIDDEN',
        overrideReason: reason.trim(),
        triagedAt: nowIso(),
        triagedBy: user.name,
      });
      await logAudit(
        actorOf(user),
        'PRIORITY_OVERRIDDEN',
        'VISIT',
        visit.id,
        `Priority ${visit.priority} → ${priority} for ${patient.firstName} ${patient.lastName}: ${reason.trim()}`,
        patient.id
      );
      push(`Priority for ${patient.firstName} ${patient.lastName} set to ${PRIORITY_META[priority].label}.`, 'success');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Set priority at triage"
      subtitle={`${patient.firstName} ${patient.lastName} · system suggestion: ${PRIORITY_META[visit.suggestedPriority].label}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={busy || reason.trim().length < 5}
          >
            Record priority
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {priorities.map((p) => (
          <label
            key={p}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              priority === p ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-200' : 'border-slate-200 hover:bg-slate-50'
            )}
          >
            <input
              type="radio"
              name="priority"
              className="mt-1 accent-teal-700"
              checked={priority === p}
              onChange={() => setPriority(p)}
            />
            <span>
              <PriorityBadge priority={p} />
              <span className="ml-2 text-xs text-slate-500">{PRIORITY_META[p].blurb}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Reason for this decision" required hint="Recorded in the audit log with your name. The tool supports clinical judgement — it never replaces it.">
        <textarea
          className="input min-h-20"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Patient reports worsening pain since arrival"
        />
      </Field>
    </Modal>
  );
}

/* ---------------------------------------------------------- admission -- */

export function AdmitDialog({
  visit,
  patient,
  onDone,
  onClose,
}: {
  visit: Visit;
  patient: Patient;
  onDone: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const [ward, setWard] = useState(WARDS[0]);
  const [bed, setBed] = useState('');
  const [condition, setCondition] = useState('');
  const [orders, setOrders] = useState([{ name: '', dose: '', times: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setOrder = (index: number, key: 'name' | 'dose' | 'times', value: string) =>
    setOrders((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  const save = async () => {
    if (!user) return;
    if (!bed.trim() || !condition.trim()) {
      setError('Bed number and treating condition are required.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const medicationOrders: MedicationOrder[] = orders
        .filter((row) => row.name.trim())
        .map((row) => ({
          id: uid('mo'),
          name: row.name.trim(),
          dose: row.dose.trim(),
          times: row.times
            .split(/[,\s]+/)
            .map((t) => t.trim())
            .filter((t) => /^\d{1,2}:\d{2}$/.test(t)),
          notes: '',
        }));
      const admission: Admission = {
        id: uid('adm'),
        patientId: patient.id,
        visitId: visit.id,
        ward,
        bed: bed.trim(),
        treatingCondition: condition.trim(),
        admittedAt: nowIso(),
        admittedBy: user.name,
        medicationOrders,
        doses: [],
        meals: [],
        dischargedAt: null,
        dischargedBy: null,
      };
      await db.admissions.add(admission);
      await db.visits.update(visit.id, {
        status: 'ADMITTED',
        admittedAt: admission.admittedAt,
        admissionId: admission.id,
      });
      await logAudit(
        actorOf(user),
        'ADMITTED',
        'ADMISSION',
        admission.id,
        `Admitted to ${ward}, bed ${admission.bed} — ${admission.treatingCondition}`,
        patient.id
      );
      push(`${patient.firstName} ${patient.lastName} admitted to ${ward}, bed ${admission.bed}.`, 'success');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Admit patient"
      subtitle={`${patient.firstName} ${patient.lastName} · ${patient.fileNumber}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <BedDouble className="h-4 w-4" />
            Admit to ward
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ward" required>
          <select className="input" value={ward} onChange={(e) => setWard(e.target.value)}>
            {WARDS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </Field>
        <Field label="Bed number" required>
          <input className="input" value={bed} onChange={(e) => setBed(e.target.value)} placeholder="e.g. A-12" />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Treating condition" required>
            <input className="input" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Community-acquired pneumonia" />
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Medication orders (daily dosages)</span>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1 text-xs"
            onClick={() => setOrders((rows) => [...rows, { name: '', dose: '', times: '' }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add medication
          </button>
        </div>
        <div className="space-y-2">
          {orders.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input className="input flex-1" placeholder="Medication name" value={row.name} onChange={(e) => setOrder(index, 'name', e.target.value)} />
              <input className="input w-28" placeholder="Dose" value={row.dose} onChange={(e) => setOrder(index, 'dose', e.target.value)} />
              <input className="input w-40" placeholder="Times, e.g. 08:00, 20:00" value={row.times} onChange={(e) => setOrder(index, 'times', e.target.value)} />
              {orders.length > 1 ? (
                <button
                  type="button"
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  onClick={() => setOrders((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Remove medication row"
                >
                  <Trash className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Times use 24-hour format (HH:mm), separated by commas. Nurses record each dose as it is given.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{error}</p>
      ) : null}
    </Modal>
  );
}

/* --------------------------------------------------------- discharge -- */

export function DischargeDialog({
  visit,
  patient,
  admission,
  onDone,
  onClose,
}: {
  visit: Visit;
  patient: Patient;
  admission?: Admission;
  onDone: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { push } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const at = nowIso();
      await db.visits.update(visit.id, { status: 'DISCHARGED', dischargedAt: at });
      if (admission) {
        await db.admissions.update(admission.id, { dischargedAt: at, dischargedBy: user.name });
      }
      await logAudit(
        actorOf(user),
        'DISCHARGED',
        admission ? 'ADMISSION' : 'VISIT',
        admission ? admission.id : visit.id,
        `Discharged ${patient.firstName} ${patient.lastName}${admission ? ` from ${admission.ward}` : ''}${note.trim() ? ` — ${note.trim()}` : ''}`,
        patient.id
      );
      push(`${patient.firstName} ${patient.lastName} discharged.`, 'success');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={admission ? 'Discharge from ward' : 'Discharge patient'}
      subtitle={`${patient.firstName} ${patient.lastName} · ${patient.fileNumber}${admission ? ` · ${admission.ward}, bed ${admission.bed}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            Confirm discharge
          </button>
        </>
      }
    >
      <Field label="Discharge note" hint="Optional — handover, referral or follow-up instructions.">
        <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
