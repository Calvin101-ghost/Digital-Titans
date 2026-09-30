/* Domain types for Beyond the Queue.
   One record per patient, one visit per encounter, an append-only audit
   trail for every action, and an admission record for inpatient care. */

export type Role = 'RECEPTION' | 'TRIAGE' | 'CLINICIAN' | 'ADMIN';

export type Department = 'EMERGENCY' | 'GENERAL' | 'MATERNITY' | 'PAEDIATRICS' | 'CHRONIC';

export type Priority = 'URGENT' | 'HIGH' | 'ROUTINE';

export type VisitStatus = 'SCHEDULED' | 'WAITING' | 'IN_CONSULTATION' | 'ADMITTED' | 'DISCHARGED';

export type TriageState = 'PENDING' | 'CONFIRMED' | 'OVERRIDDEN';

export type Gender = 'FEMALE' | 'MALE' | 'OTHER';

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN';

export type Meal = 'BREAKFAST' | 'LUNCH' | 'DINNER';

export interface StaffUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  /** Clinicians only: the field they work in ("their own field"). */
  department?: Department;
}

export interface Patient {
  id: string;
  fileNumber: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  phone: string;
  email: string;
  address: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  bloodType: BloodType;
  /** e.g. stable, critical, wheelchair, pregnant — free text set at intake. */
  currentMedicalStatus: string;
  pastMedicalHistory: string;
  previousMedication: string;
  allergies: string;
  consentPopia: boolean;
  consentedAt: string | null;
  /** PRE_REGISTRATION = created from the kiosk and not yet completed. */
  completeness: 'FULL' | 'PRE_REGISTRATION';
  registeredAt: string;
  registeredBy: string;
}

export interface Visit {
  id: string;
  reference: string;
  patientId: string;
  department: Department;
  reasonCode: string;
  suggestedPriority: Priority;
  /** Current priority (set from the suggestion, then confirmed or overridden at triage). */
  priority: Priority;
  escalatedTo: Priority | null;
  escalatedAt: string | null;
  triageState: TriageState;
  overrideReason: string | null;
  status: VisitStatus;
  scheduledFor: string | null;
  arrivedAt: string | null;
  triagedAt: string | null;
  triagedBy: string | null;
  consultationStartedAt: string | null;
  consultationStartedBy: string | null;
  admittedAt: string | null;
  dischargedAt: string | null;
  admissionId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface MedicationOrder {
  id: string;
  name: string;
  dose: string;
  /** 'HH:mm' scheduled administration times. */
  times: string[];
  notes: string;
}

export interface DoseRecord {
  id: string;
  orderId: string;
  scheduledTime: string;
  givenAt: string;
  givenBy: string;
}

export interface MealRecord {
  id: string;
  meal: Meal;
  servedAt: string;
  servedBy: string;
}

export interface Admission {
  id: string;
  patientId: string;
  visitId: string;
  ward: string;
  bed: string;
  treatingCondition: string;
  admittedAt: string;
  admittedBy: string;
  medicationOrders: MedicationOrder[];
  doses: DoseRecord[];
  meals: MealRecord[];
  dischargedAt: string | null;
  dischargedBy: string | null;
}

export type AuditAction =
  | 'PATIENT_CREATED'
  | 'PATIENT_UPDATED'
  | 'RECORD_VIEWED'
  | 'ID_REVEALED'
  | 'PRE_REGISTERED'
  | 'VISIT_CREATED'
  | 'ARRIVAL_MARKED'
  | 'TRIAGED'
  | 'PRIORITY_OVERRIDDEN'
  | 'PRIORITY_ESCALATED'
  | 'CONSULTATION_STARTED'
  | 'ADMITTED'
  | 'DOSE_GIVEN'
  | 'MEAL_RECORDED'
  | 'DISCHARGED'
  | 'SMS_SENT'
  | 'CONFIG_UPDATED'
  | 'DEMO_RESET';

export type AuditEntity = 'PATIENT' | 'VISIT' | 'ADMISSION' | 'CONFIG' | 'SYSTEM';

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  patientId: string | null;
  details: string;
  /** 0 = stored on device, not yet synced. IndexedDB cannot index booleans. */
  synced: 0 | 1;
}

export interface FacilityConfig {
  id: string;
  name: string;
  escalationRoutineToHighMinutes: number;
  escalationHighToUrgentMinutes: number;
  targetUrgentMinutes: number;
  avgConsultMinutes: number;
  updatedAt: string;
}

export interface KvEntry {
  key: string;
  value: unknown;
}
