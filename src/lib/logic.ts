/* Pure domain logic: masking, waiting times, automatic escalation,
   queue ordering and the "measuring success" metrics. No imports from the
   database or React — this module is unit-tested directly (see logic.test.ts). */

import type { Department, FacilityConfig, Priority, Visit } from './types';

const RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, ROUTINE: 2 };

export function priorityRank(p: Priority): number {
  return RANK[p];
}

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function minutesBetween(from: string | Date, to: string | Date): number {
  return Math.max(0, Math.round((toMs(to) - toMs(from)) / 60000));
}

export function minutesSince(from: string | Date, now: Date): number {
  return minutesBetween(from, now);
}

export function formatWaiting(mins: number): string {
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const clockFmt = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' });
const dayTimeFmt = new Intl.DateTimeFormat('en-ZA', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatClock(value: string | Date): string {
  return clockFmt.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDay(value: string | Date): string {
  return dayFmt.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dayTimeFmt.format(typeof value === 'string' ? new Date(value) : value);
}

/** SA ID numbers are masked on screen per POPIA least-privilege. */
export function maskIdNumber(idNumber: string): string {
  const t = idNumber.trim();
  if (t.length < 8) return '•'.repeat(Math.max(t.length, 4));
  return `${t.slice(0, 6)}••••${t.slice(-3)}`;
}

export function isSaIdNumber(value: string): boolean {
  return /^\d{13}$/.test(value.trim());
}

export function deriveAgeFromId(idNumber: string, now: Date): number | null {
  if (!isSaIdNumber(idNumber)) return null;
  const yy = Number(idNumber.slice(0, 2));
  const mm = Number(idNumber.slice(2, 4));
  const dd = Number(idNumber.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYY = now.getFullYear() % 100;
  const birthYear = (yy <= currentYY + 1 ? 2000 : 1900) + yy;
  const birthday = new Date(birthYear, mm - 1, dd);
  if (birthday.getTime() > now.getTime()) return null;
  let age = now.getFullYear() - birthYear;
  const beforeBirthday =
    now.getMonth() + 1 < mm || (now.getMonth() + 1 === mm && now.getDate() < dd);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Digits 7-10 of an SA ID: 0000-4999 female, 5000-9999 male. */
export function deriveGenderFromId(idNumber: string): 'FEMALE' | 'MALE' | null {
  if (!isSaIdNumber(idNumber)) return null;
  const n = Number(idNumber.slice(6, 10));
  if (Number.isNaN(n)) return null;
  return n < 5000 ? 'FEMALE' : 'MALE';
}

export function waitingMinutes(visit: Visit, now: Date): number | null {
  if (!visit.arrivedAt) return null;
  return minutesSince(visit.arrivedAt, now);
}

export interface Escalation {
  to: Priority;
  reason: string;
}

/** Automatic escalation per facility configuration:
    routine -> high after N minutes waiting, high -> urgent after M minutes. */
export function computeEscalation(
  visit: Visit,
  now: Date,
  cfg: Pick<FacilityConfig, 'escalationRoutineToHighMinutes' | 'escalationHighToUrgentMinutes'>
): Escalation | null {
  if (visit.status !== 'WAITING' || !visit.arrivedAt) return null;

  if (visit.priority === 'ROUTINE') {
    const waited = minutesSince(visit.arrivedAt, now);
    if (waited >= cfg.escalationRoutineToHighMinutes) {
      return {
        to: 'HIGH',
        reason: `Routine patient waited ${waited} min (threshold ${cfg.escalationRoutineToHighMinutes} min)`,
      };
    }
    return null;
  }

  if (visit.priority === 'HIGH') {
    const anchor = visit.escalatedAt ?? visit.arrivedAt;
    const inTier = minutesSince(anchor, now);
    if (inTier >= cfg.escalationHighToUrgentMinutes) {
      return {
        to: 'URGENT',
        reason: `High-priority patient waited ${inTier} min at High (threshold ${cfg.escalationHighToUrgentMinutes} min)`,
      };
    }
  }

  return null;
}

/** Priority including escalation that is due but not yet persisted. */
export function effectivePriority(
  visit: Visit,
  now: Date,
  cfg: Pick<FacilityConfig, 'escalationRoutineToHighMinutes' | 'escalationHighToUrgentMinutes'>
): Priority {
  const esc = computeEscalation(visit, now, cfg);
  return esc ? esc.to : visit.priority;
}

export interface DueEscalation {
  visit: Visit;
  to: Priority;
  reason: string;
}

export function escalationDue(
  visits: Visit[],
  now: Date,
  cfg: Pick<FacilityConfig, 'escalationRoutineToHighMinutes' | 'escalationHighToUrgentMinutes'>
): DueEscalation[] {
  const due: DueEscalation[] = [];
  for (const visit of visits) {
    const esc = computeEscalation(visit, now, cfg);
    if (esc) due.push({ visit, to: esc.to, reason: esc.reason });
  }
  return due;
}

/** Priority queue first (urgent, then high), then general; longest wait first. */
export function sortQueue(
  visits: Visit[],
  now: Date,
  cfg: Pick<FacilityConfig, 'escalationRoutineToHighMinutes' | 'escalationHighToUrgentMinutes'>
): Visit[] {
  return [...visits].sort((a, b) => {
    const rankDiff = priorityRank(effectivePriority(a, now, cfg)) - priorityRank(effectivePriority(b, now, cfg));
    if (rankDiff !== 0) return rankDiff;
    return (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? '') || a.createdAt.localeCompare(b.createdAt);
  });
}

export interface WaitEstimate {
  ahead: number;
  position: number;
  minutes: number;
}

/** Simple estimate: patients ahead in the department's queue x average consult time. */
export function estimateWait(
  department: Department,
  allVisits: Visit[],
  now: Date,
  cfg: Pick<FacilityConfig, 'avgConsultMinutes' | 'escalationRoutineToHighMinutes' | 'escalationHighToUrgentMinutes'>
): WaitEstimate {
  const queue = sortQueue(
    allVisits.filter((v) => v.status === 'WAITING' && v.department === department),
    now,
    cfg
  );
  const ahead = queue.length;
  return { ahead, position: ahead + 1, minutes: ahead * cfg.avgConsultMinutes };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Arrival -> first clinical contact, in minutes (the headline success metric). */
export function firstContactMinutes(visit: Visit): number | null {
  if (!visit.arrivedAt || !visit.consultationStartedAt) return null;
  return minutesBetween(visit.arrivedAt, visit.consultationStartedAt);
}

export interface UrgentTargetStats {
  seen: number;
  within: number;
  share: number | null;
}

export function urgentWithinTarget(
  visits: Visit[],
  targetMinutes: number
): UrgentTargetStats {
  const seen = visits.filter((v) => v.priority === 'URGENT' && firstContactMinutes(v) !== null);
  const within = seen.filter((v) => (firstContactMinutes(v) ?? Infinity) <= targetMinutes);
  return {
    seen: seen.length,
    within: within.length,
    share: seen.length > 0 ? within.length / seen.length : null,
  };
}

export function dateKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isToday(value: string, now: Date): boolean {
  return dateKey(value) === dateKey(now);
}

/** Minutes since midnight for a scheduled 'HH:mm' dose time. */
export function timeOfDayMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function percent(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`;
}
