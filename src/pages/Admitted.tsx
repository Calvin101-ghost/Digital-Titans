/* Admitted patients: a separate view of everyone currently admitted, what
   they are being treated for, today's daily dosages and meals received.
   Nurses record each dose as it is given and each meal as it is served. */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Pill, Utensils } from 'lucide-react';
import { db, nowIso, uid } from '../lib/db';
import { actorOf, useAuth } from '../lib/auth';
import { useAllVisits, useNow, usePatientsIndex } from '../lib/hooks';
import { logAudit } from '../lib/audit';
import { useToast } from '../lib/toast';
import { MEALS } from '../lib/catalog';
import { formatClock, formatDay, isToday } from '../lib/logic';
import type { Admission, Meal } from '../lib/types';
import { EmptyState, Kpi, Modal, WaitingTimer, cx } from '../components/ui';
import { DischargeDialog } from '../components/flows';

export function Admitted({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
  const now = useNow(30000);
  const patientsIndex = usePatientsIndex();
  const admissions = useLiveQuery(() => db.admissions.toArray(), [], [] as Admission[]);

  const active = admissions
    .filter((a) => !a.dischargedAt)
    .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
  const recentlyDischarged = admissions
    .filter((a) => a.dischargedAt)
    .sort((a, b) => (b.dischargedAt ?? '').localeCompare(a.dischargedAt ?? ''))
    .slice(0, 5);

  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = active.find((a) => a.id === detailId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Admitted patients</h1>
        <p className="text-sm text-slate-500">
          Everyone currently in a ward, with treating condition, daily dosages and meals received.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Currently admitted" value={active.length} />
        <Kpi
          label="Longest stay"
          value={
            active.length === 0 ? '—' : (
              <WaitingTimer from={active[active.length - 1].admittedAt} />
            )
          }
          sub="since admission"
        />
        <Kpi label="Discharged (recent)" value={recentlyDischarged.length} tone="good" />
      </div>

      {active.length === 0 ? (
        <EmptyState title="No patients currently admitted" hint="Admissions appear here as soon as a consultation ends in an admission." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((adm) => {
            const patient = patientsIndex.get(adm.patientId);
            const totalToday = adm.medicationOrders.reduce((sum, o) => sum + o.times.length, 0);
            const givenToday = adm.doses.filter((d) => isToday(d.givenAt, now)).length;
            const mealsToday = new Set(
              adm.meals.filter((m) => isToday(m.servedAt, now)).map((m) => m.meal)
            );
            return (
              <button
                key={adm.id}
                type="button"
                onClick={() => setDetailId(adm.id)}
                className="card p-4 text-left transition-colors hover:border-teal-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-teal-700">
                      {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {patient ? `${patient.age} yrs · ${patient.gender.toLowerCase()} · ${patient.fileNumber} · ` : ''}
                      <strong className="font-semibold text-slate-500">
                        {adm.ward}, bed {adm.bed}
                      </strong>
                    </p>
                    <p className="mt-1.5 text-xs text-slate-600">
                      <strong className="font-semibold">Treating:</strong> {adm.treatingCondition}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-[11px] text-slate-400">
                    admitted {formatDay(adm.admittedAt)}
                    <span className="block font-semibold text-slate-500">
                      <WaitingTimer from={adm.admittedAt} /> ago
                    </span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                  <span className="pill bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200">
                    <Pill className="h-3 w-3" />
                    {givenToday}/{totalToday} doses today
                  </span>
                  {MEALS.map((meal) => (
                    <span
                      key={meal.code}
                      className={cx(
                        'pill',
                        mealsToday.has(meal.code)
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'
                      )}
                    >
                      <Utensils className="h-3 w-3" />
                      {meal.label}
                      {mealsToday.has(meal.code) ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {recentlyDischarged.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Ward</th>
                <th>Treated for</th>
                <th>Discharged</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {recentlyDischarged.map((adm) => {
                const patient = patientsIndex.get(adm.patientId);
                return (
                  <tr key={adm.id}>
                    <td>
                      <button
                        type="button"
                        className="font-semibold text-teal-700 hover:underline"
                        onClick={() => onOpenPatient(adm.patientId)}
                      >
                        {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown'}
                      </button>
                    </td>
                    <td className="text-xs text-slate-600">
                      {adm.ward}, bed {adm.bed}
                    </td>
                    <td className="text-xs text-slate-600">{adm.treatingCondition}</td>
                    <td className="text-xs tabular-nums text-slate-500">
                      {adm.dischargedAt ? formatClock(adm.dischargedAt) : '—'}
                    </td>
                    <td className="text-xs text-slate-500">{adm.dischargedBy ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <AdmissionDetail
          admission={detail}
          now={now}
          onClose={() => setDetailId(null)}
          onOpenPatient={onOpenPatient}
        />
      ) : null}
    </div>
  );
}

function AdmissionDetail({
  admission,
  now,
  onClose,
  onOpenPatient,
}: {
  admission: Admission;
  now: Date;
  onClose: () => void;
  onOpenPatient: (id: string) => void;
}) {
  const { user, can } = useAuth();
  const { push } = useToast();
  const patientsIndex = usePatientsIndex();
  const visits = useAllVisits();
  const [discharging, setDischarging] = useState(false);

  const patient = patientsIndex.get(admission.patientId);
  const visit = visits.find((v) => v.id === admission.visitId);
  const canAct = !!user && (can('consult') || user.role === 'TRIAGE');
  const canDischarge = can('discharge');

  const doseFor = (orderId: string, time: string) =>
    admission.doses.find(
      (d) => d.orderId === orderId && d.scheduledTime === time && isToday(d.givenAt, now)
    ) ?? null;

  const mealFor = (meal: Meal) =>
    admission.meals.find((m) => m.meal === meal && isToday(m.servedAt, now)) ?? null;

  const giveDose = async (orderId: string, orderName: string, orderDose: string, time: string) => {
    if (!user) return;
    const updated: Admission = {
      ...admission,
      doses: [
        ...admission.doses,
        { id: uid('d'), orderId, scheduledTime: time, givenAt: nowIso(), givenBy: user.name },
      ],
    };
    await db.admissions.put(updated);
    await logAudit(
      actorOf(user),
      'DOSE_GIVEN',
      'ADMISSION',
      admission.id,
      `${orderName} ${orderDose} — ${time} dose given`,
      admission.patientId
    );
    push(`${orderName} ${orderDose} recorded as given at ${formatClock(nowIso())}.`, 'success');
  };

  const recordMeal = async (meal: Meal) => {
    if (!user) return;
    const updated: Admission = {
      ...admission,
      meals: [
        ...admission.meals,
        { id: uid('m'), meal, servedAt: nowIso(), servedBy: user.name },
      ],
    };
    await db.admissions.put(updated);
    const label = MEALS.find((m) => m.code === meal)?.label ?? meal;
    await logAudit(
      actorOf(user),
      'MEAL_RECORDED',
      'ADMISSION',
      admission.id,
      `${label} served`,
      admission.patientId
    );
    push(`${label} recorded as served.`, 'success');
  };

  return (
    <Modal
      title={patient ? `${patient.firstName} ${patient.lastName}` : 'Admission'}
      subtitle={`${admission.ward}, bed ${admission.bed} · admitted ${formatDay(admission.admittedAt)} by ${admission.admittedBy}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {patient ? (
            <button type="button" className="btn btn-secondary" onClick={() => onOpenPatient(patient.id)}>
              Open full record
            </button>
          ) : null}
          {canDischarge ? (
            <button type="button" className="btn btn-primary" onClick={() => setDischarging(true)}>
              Discharge from ward
            </button>
          ) : null}
        </>
      }
    >
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <strong className="font-semibold text-slate-700">Treating:</strong> {admission.treatingCondition}
        {patient?.allergies && patient.allergies !== 'None known' ? (
          <span className="ml-3 text-red-600">
            <strong className="font-semibold">Allergies:</strong> {patient.allergies}
          </span>
        ) : null}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Pill className="h-3.5 w-3.5" /> Daily dosages (today)
        </h4>
        {admission.medicationOrders.length === 0 ? (
          <p className="text-xs text-slate-400">No medication orders recorded.</p>
        ) : (
          <div className="space-y-2">
            {admission.medicationOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-700">
                  {order.name} <span className="font-normal text-slate-500">· {order.dose}</span>
                </p>
                {order.notes ? <p className="text-[11px] text-slate-400">{order.notes}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {order.times.map((time) => {
                    const record = doseFor(order.id, time);
                    return record ? (
                      <span key={time} className="pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        <Check className="h-3 w-3" />
                        {time} given {formatClock(record.givenAt)} · {record.givenBy.split(' ')[0]}
                      </span>
                    ) : (
                      <span key={time} className="pill bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                        {time} due
                        {canAct ? (
                          <button
                            type="button"
                            className="ml-1 font-bold text-teal-700 hover:underline"
                            onClick={() => void giveDose(order.id, order.name, order.dose, time)}
                          >
                            Give
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Utensils className="h-3.5 w-3.5" /> Meals received (today)
        </h4>
        <div className="flex flex-wrap gap-2">
          {MEALS.map((meal) => {
            const record = mealFor(meal.code);
            return (
              <div
                key={meal.code}
                className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                  record ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'
                )}
              >
                <span className="font-semibold">{meal.label}</span>
                {record ? (
                  <span className="text-[11px]">
                    served {formatClock(record.servedAt)} · {record.servedBy.split(' ')[0]}
                  </span>
                ) : canAct ? (
                  <button
                    type="button"
                    className="font-bold text-teal-700 hover:underline"
                    onClick={() => void recordMeal(meal.code)}
                  >
                    Record served
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">not yet</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {discharging && visit ? (
        <DischargeDialog
          visit={visit}
          patient={
            patient ?? {
              id: admission.patientId,
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
          admission={admission}
          onClose={() => setDischarging(false)}
          onDone={() => {
            setDischarging(false);
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
