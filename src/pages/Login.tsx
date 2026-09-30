/* Staff sign-in. The prototype uses named demo personas so reviewers can
   switch roles quickly; a pilot deployment would use staff credentials
   with the same role model. */

import { useState } from 'react';
import { ArrowRight, HeartPulse, ShieldCheck, Stethoscope, UserPlus } from 'lucide-react';
import { DEPARTMENTS, PERSONAS, ROLE_META } from '../lib/catalog';
import { useAuth } from '../lib/auth';
import type { Department, Role, StaffUser } from '../lib/types';
import { cx } from '../components/ui';

const ROLE_ICON: Record<Role, typeof UserPlus> = {
  RECEPTION: UserPlus,
  TRIAGE: Stethoscope,
  CLINICIAN: HeartPulse,
  ADMIN: ShieldCheck,
};

const FEATURES = [
  'One digital record per patient — found by ID number, nothing captured twice',
  'Priority queue (urgent + high) and general queue, longest wait first',
  'Automatic escalation when waits pass the agreed thresholds',
  'Works offline: actions are stored on the device and sync when the connection returns',
  'Role-based access and an audit log of every record opened or changed',
];

export function Login({ onKiosk }: { onKiosk: () => void }) {
  const { login } = useAuth();
  const [selectedId, setSelectedId] = useState(PERSONAS[0].id);
  const [department, setDepartment] = useState<Department>('GENERAL');

  const persona = PERSONAS.find((p) => p.id === selectedId) ?? PERSONAS[0];

  const signIn = () => {
    const user: StaffUser =
      persona.role === 'CLINICIAN' ? { ...persona, department } : persona;
    login(user);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="flex flex-col justify-between bg-gradient-to-br from-teal-600 to-teal-800 p-8 text-white lg:p-12">
        <div>
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl shadow-lg" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Beyond the Queue</h1>
              <p className="text-xs text-teal-100">Patient flow &amp; records — pilot prototype</p>
            </div>
          </div>
          <h2 className="mt-10 max-w-md text-2xl font-bold leading-snug lg:text-3xl">
            The right patient, seen in the right order, with the right record.
          </h2>
          <ul className="mt-8 max-w-md space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-teal-50">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-200" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 max-w-md text-[11px] leading-relaxed text-teal-100/80">
          Health data is special personal information under POPIA. This prototype stores data only on this
          device; the pilot adds encrypted server sync, hosting in South Africa and a breach-response
          procedure.
        </p>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center bg-slate-100 p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h3 className="text-lg font-bold text-slate-800">Sign in as staff</h3>
          <p className="mt-1 text-sm text-slate-500">
            Choose a team member. Each role sees only its own field of work.
          </p>

          <div className="mt-5 space-y-2">
            {PERSONAS.map((p) => {
              const Icon = ROLE_ICON[p.role];
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                    active ? 'border-teal-500 bg-white ring-1 ring-teal-200' : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                      <span className="text-[11px] text-slate-400">{p.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      <strong className="font-semibold text-slate-600">{ROLE_META[p.role].label}:</strong>{' '}
                      {ROLE_META[p.role].blurb}
                    </span>
                    {p.role === 'CLINICIAN' && active ? (
                      <span className="mt-2 block" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[11px] font-semibold text-slate-500">Your field</label>
                        <select
                          className="input mt-1"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value as Department)}
                        >
                          {DEPARTMENTS.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <button type="button" className="btn btn-primary mt-5 w-full !py-2.5" onClick={signIn}>
            Sign in as {persona.name.split(' ')[0]} {persona.name.split(' ').slice(-1)[0]}
          </button>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Patients</p>
            <button type="button" className="btn btn-secondary mt-2 w-full !py-2.5" onClick={onKiosk}>
              Pre-register before coming in (kiosk mode)
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-2 text-[11px] text-slate-400">
              Patients pre-register from home and receive an estimated wait by SMS, so they can arrive
              closer to their turn. Urgent cases are never delayed by this.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
