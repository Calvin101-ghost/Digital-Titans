/* Static catalogue: reasons for visit, departments, roles, staff personas,
   permissions and facility defaults. Everything the UI shows comes from
   here so the pilot team can adjust the fixed lists in one place. */

import type {
  BloodType,
  Department,
  FacilityConfig,
  Meal,
  Priority,
  Role,
  StaffUser,
  VisitStatus,
} from './types';

export interface ReasonOption {
  code: string;
  label: string;
  priority: Priority;
  department: Department;
}

/** Fixed reasons for visit, each with a suggested priority and department. */
export const REASONS: ReasonOption[] = [
  { code: 'CHEST_PAIN', label: 'Chest pain / difficulty breathing', priority: 'URGENT', department: 'EMERGENCY' },
  { code: 'SEVERE_BLEEDING', label: 'Severe bleeding or trauma', priority: 'URGENT', department: 'EMERGENCY' },
  { code: 'COLLAPSE', label: 'Collapse / loss of consciousness', priority: 'URGENT', department: 'EMERGENCY' },
  { code: 'PREG_EMERGENCY', label: 'Pregnancy emergency (bleeding / contractions)', priority: 'URGENT', department: 'MATERNITY' },
  { code: 'HIGH_FEVER', label: 'High fever', priority: 'HIGH', department: 'GENERAL' },
  { code: 'SICK_CHILD', label: 'Sick child under 5', priority: 'HIGH', department: 'PAEDIATRICS' },
  { code: 'ABDOMINAL', label: 'Abdominal / stomach pain', priority: 'HIGH', department: 'GENERAL' },
  { code: 'MENTAL_HEALTH', label: 'Mental health concern', priority: 'HIGH', department: 'GENERAL' },
  { code: 'MATERNITY_CHECK', label: 'Pregnancy / antenatal check-up', priority: 'ROUTINE', department: 'MATERNITY' },
  { code: 'CHRONIC_CHECK', label: 'Chronic condition check (diabetes, hypertension, HIV)', priority: 'ROUTINE', department: 'CHRONIC' },
  { code: 'MEDS_REFILL', label: 'Medication refill', priority: 'ROUTINE', department: 'CHRONIC' },
  { code: 'MINOR_INJURY', label: 'Minor injury / sprain / wound', priority: 'ROUTINE', department: 'GENERAL' },
  { code: 'RESP_INFECTION', label: 'Cough, flu or chest infection', priority: 'ROUTINE', department: 'GENERAL' },
  { code: 'STI_FP', label: 'STI test / family planning', priority: 'ROUTINE', department: 'GENERAL' },
  { code: 'VACCINATION', label: 'Vaccination / immunisation', priority: 'ROUTINE', department: 'PAEDIATRICS' },
  { code: 'REFERRAL', label: 'Referral letter / results collection', priority: 'ROUTINE', department: 'GENERAL' },
];

export function reasonByCode(code: string): ReasonOption | undefined {
  return REASONS.find((r) => r.code === code);
}

export function reasonLabel(code: string): string {
  return reasonByCode(code)?.label ?? code;
}

export const DEPARTMENTS: { code: Department; label: string }[] = [
  { code: 'EMERGENCY', label: 'Emergency' },
  { code: 'GENERAL', label: 'General Practice' },
  { code: 'MATERNITY', label: 'Maternity' },
  { code: 'PAEDIATRICS', label: 'Paediatrics' },
  { code: 'CHRONIC', label: 'Chronic Care' },
];

export function departmentLabel(code: Department): string {
  return DEPARTMENTS.find((d) => d.code === code)?.label ?? code;
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; badge: string; dot: string; blurb: string }
> = {
  URGENT: {
    label: 'Urgent',
    badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    dot: 'bg-red-500',
    blurb: 'Needs immediate attention — cannot safely wait.',
  },
  HIGH: {
    label: 'High',
    badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    dot: 'bg-amber-500',
    blurb: 'Needs to be seen soon; condition should be monitored.',
  },
  ROUTINE: {
    label: 'Routine',
    badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    dot: 'bg-sky-500',
    blurb: 'Can safely wait; will be seen in arrival order.',
  },
};

export const STATUS_META: Record<VisitStatus, { label: string; badge: string }> = {
  SCHEDULED: { label: 'Pre-registered', badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  WAITING: { label: 'Waiting', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  IN_CONSULTATION: { label: 'In consultation', badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  ADMITTED: { label: 'Admitted', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  DISCHARGED: { label: 'Discharged', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

export const ROLE_META: Record<Role, { label: string; blurb: string }> = {
  RECEPTION: { label: 'Reception', blurb: 'Register patients, find records by ID, mark arrivals.' },
  TRIAGE: { label: 'Triage nurse', blurb: 'Confirm or override priority for every arrival.' },
  CLINICIAN: { label: 'Clinical staff', blurb: 'Your field only: queues, consultations, admissions.' },
  ADMIN: { label: 'Records officer', blurb: 'Oversight: audit log, admissions view, facility settings.' },
};

export const PERSONAS: StaffUser[] = [
  { id: 'u-reception', name: 'Lerato Mahlangu', title: 'Receptionist', role: 'RECEPTION' },
  { id: 'u-triage', name: 'Sister Bongi Zulu', title: 'Triage Nurse', role: 'TRIAGE' },
  { id: 'u-clinician', name: 'Dr Sipho Ndlovu', title: 'Medical Officer', role: 'CLINICIAN' },
  { id: 'u-admin', name: 'Thabo Molefe', title: 'Records Officer', role: 'ADMIN' },
];

export const WARDS = [
  'Medical Ward A',
  'Medical Ward B',
  'Maternity Ward',
  'Paediatric Ward',
  'High Care Unit',
];

export const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'];

export const MEALS: { code: Meal; label: string }[] = [
  { code: 'BREAKFAST', label: 'Breakfast' },
  { code: 'LUNCH', label: 'Lunch' },
  { code: 'DINNER', label: 'Dinner' },
];

export const GENDERS: { code: 'FEMALE' | 'MALE' | 'OTHER'; label: string }[] = [
  { code: 'FEMALE', label: 'Female' },
  { code: 'MALE', label: 'Male' },
  { code: 'OTHER', label: 'Other' },
];

/** Permissions per role — least privilege. Staff see only their field. */
export type Perm =
  | 'register'
  | 'triage'
  | 'consult'
  | 'admit'
  | 'discharge'
  | 'viewClinical'
  | 'viewAudit'
  | 'manageSettings'
  | 'viewAllDepartments'
  | 'revealId';

export const PERMISSIONS: Record<Role, Perm[]> = {
  RECEPTION: ['register', 'revealId'],
  TRIAGE: ['triage', 'viewClinical', 'viewAllDepartments'],
  CLINICIAN: ['consult', 'admit', 'discharge', 'viewClinical'],
  ADMIN: ['viewClinical', 'viewAudit', 'manageSettings', 'viewAllDepartments', 'revealId'],
};

export const CONFIG_DEFAULTS: FacilityConfig = {
  id: 'facility',
  name: 'Ubuntu Community Health Centre — Soweto (pilot)',
  escalationRoutineToHighMinutes: 90,
  escalationHighToUrgentMinutes: 45,
  targetUrgentMinutes: 60,
  avgConsultMinutes: 15,
  updatedAt: new Date().toISOString(),
};
