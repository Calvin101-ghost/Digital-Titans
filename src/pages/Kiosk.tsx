/* Patient-facing pre-registration (kiosk mode). Creates or reuses the
   patient record by ID number, estimates the wait and shows exactly what
   the SMS would say. Urgent reasons are told to come in immediately. */

import { useState } from 'react';
import { ArrowLeft, CircleCheck, TriangleAlert } from 'lucide-react';
import { db, nextFileNumber, nowIso, uid } from '../lib/db';
import { useAllVisits, useConfig, useNow } from '../lib/hooks';
import { logAudit, type Actor } from '../lib/audit';
import { REASONS, departmentLabel, reasonByCode } from '../lib/catalog';
import { deriveAgeFromId, deriveGenderFromId, estimateWait, formatClock, formatWaiting, type WaitEstimate } from '../lib/logic';
import type { Patient, Visit } from '../lib/types';
import { Field, SmsBubble } from '../components/ui';

const KIOSK_ACTOR: Actor = { id: 'kiosk', name: 'Patient kiosk (self-service)', role: 'RECEPTION' };

interface DoneState {
  patient: Patient;
  visit: Visit;
  estimate: WaitEstimate;
  isNew: boolean;
}

export function Kiosk({ onExit }: { onExit: () => void }) {
  const config = useConfig();
  const visits = useAllVisits();
  const now = useNow(30000);

  const [form, setForm] = useState({
    idNumber: '',
    firstName: '',
    lastName: '',
    phone: '',
    reasonCode: '',
    consent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const derivedAge = deriveAgeFromId(form.idNumber, new Date());

  const submit = async () => {
    const id = form.idNumber.trim();
    if (id.length < 6) return setError('Please enter your ID number (13 digits for a South African ID).');
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('Please enter your first and last name.');
    if (!form.phone.trim()) return setError('Please enter a cellphone number so we can SMS you.');
    const reason = reasonByCode(form.reasonCode);
    if (!reason) return setError('Please choose the reason for your visit.');
    if (!form.consent) return setError('Please tick the consent box so we may store your information.');
    setError(null);
    setBusy(true);
    try {
      // Reuse the existing record when the ID number is already known.
      let patient = await db.patients.where('idNumber').equals(id).first();
      const isNew = !patient;
      if (!patient) {
        patient = {
          id: uid('p'),
          fileNumber: await nextFileNumber(),
          idNumber: id,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          age: deriveAgeFromId(id, new Date()) ?? 0,
          gender: deriveGenderFromId(id) ?? 'OTHER',
          phone: form.phone.trim(),
          email: '',
          address: '',
          nextOfKinName: '',
          nextOfKinPhone: '',
          bloodType: 'UNKNOWN',
          currentMedicalStatus: 'To be captured at reception',
          pastMedicalHistory: '',
          previousMedication: '',
          allergies: '',
          consentPopia: true,
          consentedAt: nowIso(),
          completeness: 'PRE_REGISTRATION',
          registeredAt: nowIso(),
          registeredBy: 'Kiosk (self pre-registration)',
        };
        await db.patients.add(patient);
        await logAudit(
          KIOSK_ACTOR,
          'PATIENT_CREATED',
          'PATIENT',
          patient.id,
          `Self pre-registration at kiosk (${patient.fileNumber})`,
          patient.id
        );
      }

      const estimate = estimateWait(reason.department, visits, now, config);
      const urgent = reason.priority === 'URGENT';
      const scheduledFor = urgent
        ? nowIso()
        : new Date(Date.now() + estimate.minutes * 60000).toISOString();

      const visit: Visit = {
        id: uid('v'),
        reference: `V-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        patientId: patient.id,
        department: reason.department,
        reasonCode: reason.code,
        suggestedPriority: reason.priority,
        priority: reason.priority,
        escalatedTo: null,
        escalatedAt: null,
        triageState: 'PENDING',
        overrideReason: null,
        status: 'SCHEDULED',
        scheduledFor,
        arrivedAt: null,
        triagedAt: null,
        triagedBy: null,
        consultationStartedAt: null,
        consultationStartedBy: null,
        admittedAt: null,
        dischargedAt: null,
        admissionId: null,
        createdAt: nowIso(),
        createdBy: 'Kiosk (self pre-registration)',
      };
      await db.visits.add(visit);
      await logAudit(
        KIOSK_ACTOR,
        'PRE_REGISTERED',
        'VISIT',
        visit.id,
        `Pre-registered at kiosk — ${reason.label} (${departmentLabel(reason.department)}), suggested ${reason.priority}, est. wait ${estimate.minutes} min`,
        patient.id
      );

      setDone({ patient, visit, estimate, isNew });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setForm({ idNumber: '', firstName: '', lastName: '', phone: '', reasonCode: '', consent: false });
    setError(null);
  };

  const urgent = done ? reasonByCode(done.visit.reasonCode)?.priority === 'URGENT' : false;
  const smsText = done
    ? `BEYOND THE QUEUE — ${config.name}: Hi ${done.patient.firstName}, you are pre-registered (ref ${done.visit.reference}) for ${departmentLabel(done.visit.department)}. ` +
      (urgent
        ? 'Come in IMMEDIATELY — do not wait.'
        : `Please arrive around ${formatClock(done.visit.scheduledFor ?? nowIso())}. Estimated wait ~${done.estimate.minutes} min.`) +
      ' Show this SMS at reception.'
    : '';

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <div>
              <p className="text-sm font-bold text-slate-800">Patient pre-registration</p>
              <p className="text-[11px] text-slate-500">{config.name}</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            <ArrowLeft className="h-4 w-4" />
            Staff sign-in
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {done ? (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-start gap-3">
                {urgent ? (
                  <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
                ) : (
                  <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {urgent ? 'Come to the clinic immediately' : 'You are pre-registered'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {urgent
                      ? 'Your reason for visiting needs emergency care. Please proceed to the facility now — do not wait at home.'
                      : `Arrive around ${formatClock(done.visit.scheduledFor ?? nowIso())} so you don't lose a full day in the queue. If you arrive earlier you will simply wait in the general queue.`}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Reference</p>
                  <p className="text-sm font-bold text-slate-800">{done.visit.reference}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Field</p>
                  <p className="text-sm font-bold text-slate-800">{departmentLabel(done.visit.department)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Est. wait now</p>
                  <p className="text-sm font-bold text-slate-800">{formatWaiting(done.estimate.minutes)}</p>
                </div>
              </div>

              {done.isNew ? (
                <p className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-800 ring-1 ring-teal-200">
                  A new file was opened for you: <strong>{done.patient.fileNumber}</strong>. Bring your ID
                  next time and the receptionist will find the same record — nothing is captured twice.
                </p>
              ) : (
                <p className="mt-3 rounded-lg bg-teal-50 p-2.5 text-xs text-teal-800 ring-1 ring-teal-200">
                  Welcome back — we found your existing record <strong>{done.patient.fileNumber}</strong> by
                  your ID number.
                </p>
              )}

              <div className="mt-4">
                <SmsBubble text={smsText} />
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={reset}>
                  Register another person
                </button>
                <button type="button" className="btn btn-primary" onClick={onExit}>
                  Finish
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-5">
            <h2 className="text-lg font-bold text-slate-800">Register before you travel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Fill in your details, choose the reason for your visit, and you will receive an estimated wait
              by SMS so you can arrive closer to your turn.
            </p>

            <div className="mt-5 space-y-4">
              <Field
                label="ID number"
                required
                hint={derivedAge !== null ? `Age detected from ID: ${derivedAge} years.` : '13 digits on a South African ID. Passport numbers also accepted.'}
              >
                <input
                  className="input font-mono !text-base"
                  inputMode="numeric"
                  value={form.idNumber}
                  onChange={(e) => set('idNumber', e.target.value)}
                  placeholder="e.g. 9203155800083"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" required>
                  <input className="input !text-base" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
                </Field>
                <Field label="Last name" required>
                  <input className="input !text-base" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
                </Field>
              </div>

              <Field label="Cellphone number" required hint="Your estimated wait is sent to this number.">
                <input className="input !text-base" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="072 000 0000" />
              </Field>

              <Field label="Reason for your visit" required>
                <select className="input !text-base" value={form.reasonCode} onChange={(e) => set('reasonCode', e.target.value)}>
                  <option value="" disabled>
                    Choose the closest reason…
                  </option>
                  {REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-teal-700"
                  checked={form.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                />
                <span className="text-xs text-slate-600">
                  I agree that my personal and health information may be stored and processed for my care, in
                  line with POPIA. I understand priority is decided by clinical staff, never by me.
                </span>
              </label>

              {error ? (
                <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{error}</p>
              ) : null}

              <button type="button" className="btn btn-primary w-full !py-3 !text-base" onClick={() => void submit()} disabled={busy}>
                {busy ? 'Registering…' : 'Pre-register and get my SMS'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
