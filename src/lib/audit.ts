/* Append-only audit trail. Every record opened, every change made, by whom
   and when. Entries start as synced = 0 (stored on device) and are flushed
   by the sync service when connectivity returns. */

import { db, nowIso, uid } from './db';
import type { AuditAction, AuditEntity, AuditEntry, Role } from './types';

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export const SYSTEM_ACTOR: Actor = {
  id: 'system',
  name: 'System — automatic escalation',
  role: 'ADMIN',
};

export async function logAudit(
  actor: Actor,
  action: AuditAction,
  entityType: AuditEntity,
  entityId: string,
  details: string,
  patientId: string | null = null
): Promise<void> {
  const entry: AuditEntry = {
    id: uid('a'),
    at: nowIso(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    patientId,
    details,
    synced: 0,
  };
  await db.audit.add(entry);
}

/** Opening a record is logged, but repeated views within 30s by the same
    staff member are collapsed to avoid noise from UI re-mounts. */
export async function logRecordView(
  actor: Actor,
  patientId: string,
  patientName: string
): Promise<void> {
  const recent = await db.audit
    .where('patientId')
    .equals(patientId)
    .filter((e) => e.action === 'RECORD_VIEWED' && e.actorId === actor.id)
    .reverse()
    .sortBy('at');
  const last = recent[0];
  if (last && Date.now() - new Date(last.at).getTime() < 30_000) return;
  await logAudit(actor, 'RECORD_VIEWED', 'PATIENT', patientId, `Opened record for ${patientName}`, patientId);
}

export const AUDIT_LABEL: Record<AuditAction, string> = {
  PATIENT_CREATED: 'Patient registered',
  PATIENT_UPDATED: 'Record updated',
  RECORD_VIEWED: 'Record opened',
  ID_REVEALED: 'ID number revealed',
  PRE_REGISTERED: 'Pre-registered',
  VISIT_CREATED: 'Visit created',
  ARRIVAL_MARKED: 'Arrival marked',
  TRIAGED: 'Priority confirmed',
  PRIORITY_OVERRIDDEN: 'Priority overridden',
  PRIORITY_ESCALATED: 'Auto-escalated',
  CONSULTATION_STARTED: 'Consultation started',
  ADMITTED: 'Admitted',
  DOSE_GIVEN: 'Dose given',
  MEAL_RECORDED: 'Meal served',
  DISCHARGED: 'Discharged',
  SMS_SENT: 'SMS sent (simulated)',
  CONFIG_UPDATED: 'Settings updated',
  DEMO_RESET: 'Demo data reset',
};

const ACTION_BADGE: Record<AuditAction, string> = {
  PATIENT_CREATED: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  PATIENT_UPDATED: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  RECORD_VIEWED: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  ID_REVEALED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  PRE_REGISTERED: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  VISIT_CREATED: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  ARRIVAL_MARKED: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  TRIAGED: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  PRIORITY_OVERRIDDEN: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  PRIORITY_ESCALATED: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  CONSULTATION_STARTED: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  ADMITTED: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  DOSE_GIVEN: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  MEAL_RECORDED: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  DISCHARGED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  SMS_SENT: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  CONFIG_UPDATED: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  DEMO_RESET: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

export function auditBadge(action: AuditAction): string {
  return ACTION_BADGE[action];
}
