/* IndexedDB storage (Dexie). Everything the app does happens on-device
   first; the audit trail doubles as the sync outbox (synced = 0 until the
   connection returns). Seeded with a realistic clinic day for the demo. */

import Dexie, { type Table } from 'dexie';
import type {
  Admission,
  AuditEntry,
  FacilityConfig,
  Gender,
  KvEntry,
  Patient,
  Priority,
  Department,
  Visit,
} from './types';
import { CONFIG_DEFAULTS } from './catalog';

export class AppDB extends Dexie {
  patients!: Table<Patient, string>;
  visits!: Table<Visit, string>;
  admissions!: Table<Admission, string>;
  audit!: Table<AuditEntry, string>;
  config!: Table<FacilityConfig, string>;
  kv!: Table<KvEntry, string>;

  constructor() {
    super('beyond-the-queue');
    this.version(1).stores({
      patients: 'id, idNumber, fileNumber, lastName',
      visits: 'id, patientId, status, department, arrivedAt',
      admissions: 'id, patientId, visitId, dischargedAt',
      audit: 'id, at, patientId, entityId, action, synced',
      config: 'id',
      kv: 'key',
    });
  }
}

export const db = new AppDB();

let seq = 0;
export function uid(prefix = ''): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function nextFileNumber(): Promise<string> {
  const count = await db.patients.count();
  return `BQ-${String(count + 1).padStart(6, '0')}`;
}

export async function getConfig(): Promise<FacilityConfig> {
  return (await db.config.get('facility')) ?? CONFIG_DEFAULTS;
}

/* ---------------------------------------------------------------- seed -- */

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

let fileNo = 0;
const nextFile = () => `BQ-${String((fileNo += 1)).padStart(6, '0')}`;

let refNo = 2400;

function mkPatient(
  p: Partial<Patient> & {
    firstName: string;
    lastName: string;
    idNumber: string;
    age: number;
    gender: Gender;
  }
): Patient {
  return {
    id: uid('p'),
    fileNumber: nextFile(),
    phone: '072 000 0000',
    email: '',
    address: '',
    nextOfKinName: '',
    nextOfKinPhone: '',
    bloodType: 'UNKNOWN',
    currentMedicalStatus: 'Stable',
    pastMedicalHistory: 'None recorded',
    previousMedication: 'None',
    allergies: 'None known',
    consentPopia: true,
    consentedAt: minsAgo(60 * 24 * 30),
    completeness: 'FULL',
    registeredAt: minsAgo(60 * 24 * 30),
    registeredBy: 'Lerato Mahlangu',
    ...p,
  };
}

function mkVisit(
  v: Partial<Visit> & {
    patientId: string;
    reasonCode: string;
    department: Department;
    suggestedPriority: Priority;
  }
): Visit {
  const now = minsAgo(60);
  return {
    id: uid('v'),
    reference: `V-${(refNo += 1)}`,
    priority: v.suggestedPriority,
    escalatedTo: null,
    escalatedAt: null,
    triageState: 'PENDING',
    overrideReason: null,
    status: 'WAITING',
    scheduledFor: null,
    arrivedAt: null,
    triagedAt: null,
    triagedBy: null,
    consultationStartedAt: null,
    consultationStartedBy: null,
    admittedAt: null,
    dischargedAt: null,
    admissionId: null,
    createdAt: now,
    createdBy: 'Lerato Mahlangu',
    ...v,
  };
}

async function seed(): Promise<void> {
  fileNo = 0;
  refNo = 2400;

  await db.config.put({ ...CONFIG_DEFAULTS, updatedAt: nowIso() });

  /* Patients ----------------------------------------------------------- */
  const thabo = mkPatient({
    firstName: 'Thabo',
    lastName: 'Mokoena',
    idNumber: '9203155800083',
    age: 34,
    gender: 'MALE',
    phone: '073 555 1212',
    address: '12 Vilakazi Street, Orlando West, Soweto',
    nextOfKinName: 'Palesa Mokoena (wife)',
    nextOfKinPhone: '082 555 9090',
    bloodType: 'O+',
    currentMedicalStatus: 'Stable — chest pain since this morning',
    pastMedicalHistory: 'Hypertension (2021), smoker',
    previousMedication: 'Amlodipine 5 mg daily',
  });
  const naledi = mkPatient({
    firstName: 'Naledi',
    lastName: 'Dlamini',
    idNumber: '9806240234087',
    age: 28,
    gender: 'FEMALE',
    phone: '081 555 3434',
    address: '45 Chris Hani Road, Diepkloof',
    nextOfKinName: 'Sibusiso Dlamini (brother)',
    nextOfKinPhone: '084 555 2323',
    bloodType: 'B+',
    currentMedicalStatus: 'Pregnant, 38 weeks — contractions',
    pastMedicalHistory: 'One previous caesarean section',
    previousMedication: 'Folic acid 5 mg',
  });
  const pieter = mkPatient({
    firstName: 'Pieter',
    lastName: 'van der Merwe',
    idNumber: '5901125602081',
    age: 67,
    gender: 'MALE',
    phone: '082 555 7878',
    address: '8 Protea Street, Roodepoort',
    nextOfKinName: 'Anna van der Merwe (daughter)',
    nextOfKinPhone: '083 555 4545',
    bloodType: 'A+',
    currentMedicalStatus: 'Abdominal pain, tender on palpation',
    pastMedicalHistory: 'Type 2 diabetes, gout',
    previousMedication: 'Metformin 850 mg bd, Allopurinol 300 mg',
  });
  const aisha = mkPatient({
    firstName: 'Aisha',
    lastName: 'Patel',
    idNumber: '8107030456082',
    age: 45,
    gender: 'FEMALE',
    phone: '074 555 6565',
    address: '22 Mint Road, Fordsburg',
    nextOfKinName: 'Yusuf Patel (husband)',
    nextOfKinPhone: '071 555 8787',
    bloodType: 'AB-',
    currentMedicalStatus: 'Fever 39.2°C since last night',
    pastMedicalHistory: 'Asthma',
    previousMedication: 'Salbutamol inhaler prn',
  });
  const sipho = mkPatient({
    firstName: 'Sipho',
    lastName: 'Ndlovu',
    idNumber: '7402195701084',
    age: 52,
    gender: 'MALE',
    phone: '076 555 0101',
    address: '101 Zone 4, Meadowlands',
    nextOfKinName: 'Thandi Ndlovu (sister)',
    nextOfKinPhone: '072 555 1919',
    bloodType: 'O-',
    currentMedicalStatus: 'Stable — here for monthly chronic review',
    pastMedicalHistory: 'HIV on ART (2016), hypertension',
    previousMedication: 'TLD fixed-dose combination, Hydrochlorothiazide 25 mg',
  });
  const zanele = mkPatient({
    firstName: 'Zanele',
    lastName: 'Nkosi',
    idNumber: '9505080312089',
    age: 31,
    gender: 'FEMALE',
    phone: '078 555 2727',
    address: '77 Umzimvubu Street, Pimville',
    nextOfKinName: 'Mama Nkosi (mother)',
    nextOfKinPhone: '079 555 3636',
    bloodType: 'A-',
    currentMedicalStatus: 'Stable — collecting monthly medication',
    pastMedicalHistory: 'Epilepsy',
    previousMedication: 'Carbamazepine 200 mg bd',
  });
  const johannes = mkPatient({
    firstName: 'Johannes',
    lastName: 'Botha',
    idNumber: '5309305508086',
    age: 73,
    gender: 'MALE',
    phone: '084 555 4848',
    address: '3 Church Street, Eldorado Park',
    nextOfKinName: 'Maria Botha (wife)',
    nextOfKinPhone: '083 555 5959',
    bloodType: 'B-',
    currentMedicalStatus: 'Productive cough for 5 days',
    pastMedicalHistory: 'COPD, previous TB (1998)',
    previousMedication: 'Tiotropium inhaler',
  });
  const precious = mkPatient({
    firstName: 'Precious',
    lastName: 'Ncube',
    idNumber: '0304020287085',
    age: 23,
    gender: 'FEMALE',
    phone: '063 555 6060',
    address: '9 Immink Drive, Diepkloof Zone 6',
    nextOfKinName: 'Grace Ncube (aunt)',
    nextOfKinPhone: '064 555 7171',
    bloodType: 'O+',
    currentMedicalStatus: 'Pregnant, 24 weeks — routine visit',
    pastMedicalHistory: 'None',
    previousMedication: 'Ferrous sulphate',
  });
  const kagiso = mkPatient({
    firstName: 'Kagiso',
    lastName: 'Molefe',
    idNumber: '0701275514082',
    age: 19,
    gender: 'MALE',
    phone: '065 555 8282',
    address: '18 Mphuthi Street, Dube',
    nextOfKinName: 'Kgomotso Molefe (mother)',
    nextOfKinPhone: '066 555 9393',
    bloodType: 'UNKNOWN',
    currentMedicalStatus: 'Stable — twisted ankle at soccer practice',
    pastMedicalHistory: 'None',
    previousMedication: 'None',
  });
  const mandla = mkPatient({
    firstName: 'Mandla',
    lastName: 'Zulu',
    idNumber: '6608145410088',
    age: 60,
    gender: 'MALE',
    phone: '067 555 0404',
    address: '55 Bhambatha Street, Orlando East',
    nextOfKinName: 'Nomvula Zulu (daughter)',
    nextOfKinPhone: '068 555 1515',
    bloodType: 'A+',
    currentMedicalStatus: 'Anxious, not sleeping for a week',
    pastMedicalHistory: 'Depression (2019)',
    previousMedication: 'Fluoxetine 20 mg daily',
  });
  const refilwe = mkPatient({
    firstName: 'Refilwe',
    lastName: 'Sithole',
    idNumber: '9011050421083',
    age: 36,
    gender: 'FEMALE',
    phone: '069 555 2626',
    address: '212 Elias Motsoaledi Road, Mzimhlophe',
    nextOfKinName: 'Kabelo Sithole (husband)',
    nextOfKinPhone: '060 555 3737',
    bloodType: 'O+',
    currentMedicalStatus: 'Abdominal cramps, under evaluation',
    pastMedicalHistory: 'Iron-deficiency anaemia',
    previousMedication: 'Ferrous sulphate 200 mg',
  });
  const lungelo = mkPatient({
    firstName: 'Lungelo',
    lastName: 'Khumalo',
    idNumber: '2203185123081',
    age: 4,
    gender: 'MALE',
    phone: '061 555 4848',
    address: '31 Mputa Street, Chiawelo',
    nextOfKinName: 'Nokuthula Khumalo (mother)',
    nextOfKinPhone: '062 555 5959',
    bloodType: 'UNKNOWN',
    currentMedicalStatus: 'Fever 38.9°C, refusing food',
    pastMedicalHistory: 'Premature birth',
    previousMedication: 'Paracetamol syrup prn',
  });
  const grace = mkPatient({
    firstName: 'Grace',
    lastName: 'Mahlaba',
    idNumber: '6802110350099',
    age: 58,
    gender: 'FEMALE',
    phone: '071 555 6161',
    address: '88 Koma Road, Klipspruit',
    nextOfKinName: 'Lerato Mahlaba (daughter)',
    nextOfKinPhone: '072 555 7272',
    bloodType: 'B+',
    currentMedicalStatus: 'Admitted — pneumonia, on oxygen support at night',
    pastMedicalHistory: 'Type 2 diabetes, hypertension',
    previousMedication: 'Metformin, Amlodipine',
    registeredAt: minsAgo(60 * 26),
    registeredBy: 'Lerato Mahlangu',
  });
  const themba = mkPatient({
    firstName: 'Themba',
    lastName: 'Radebe',
    idNumber: '8506075620087',
    age: 41,
    gender: 'MALE',
    phone: '073 555 8383',
    address: '5 Nkosi Street, Zola North',
    nextOfKinName: 'Busisiwe Radebe (wife)',
    nextOfKinPhone: '074 555 9494',
    bloodType: 'AB+',
    currentMedicalStatus: 'Admitted — blood sugar stabilising',
    pastMedicalHistory: 'Type 2 diabetes (2020)',
    previousMedication: 'Metformin 850 mg bd',
    registeredAt: minsAgo(60 * 10),
    registeredBy: 'Lerato Mahlangu',
  });
  const karabo = mkPatient({
    firstName: 'Karabo',
    lastName: 'Sithole',
    idNumber: '9703220198084',
    age: 29,
    gender: 'FEMALE',
    phone: '075 555 0505',
    address: '40 Phiri Street, Senaoane',
    nextOfKinName: 'Mpho Sithole (brother)',
    nextOfKinPhone: '076 555 1616',
    bloodType: 'A+',
    currentMedicalStatus: 'Discharged — results collected',
    pastMedicalHistory: 'None',
    previousMedication: 'None',
  });
  const david = mkPatient({
    firstName: 'David',
    lastName: 'Ngobeni',
    idNumber: '6005165482082',
    age: 66,
    gender: 'MALE',
    phone: '077 555 2727',
    address: '16 Mzilikazi Street, Moroka',
    nextOfKinName: 'Sarah Ngobeni (wife)',
    nextOfKinPhone: '078 555 3838',
    bloodType: 'O+',
    currentMedicalStatus: 'Discharged — chest pain ruled out, referred to cardiology',
    pastMedicalHistory: 'High cholesterol',
    previousMedication: 'Simvastatin 40 mg nocte',
  });

  const patients = [
    thabo, naledi, pieter, aisha, sipho, zanele, johannes, precious, kagiso, mandla,
    refilwe, lungelo, grace, themba, karabo, david,
  ];
  await db.patients.bulkAdd(patients);

  /* Today's visits ------------------------------------------------------ */
  const triage = (m: number) => ({ triagedAt: minsAgo(m), triagedBy: 'Sister Bongi Zulu' });

  const vThabo = mkVisit({
    patientId: thabo.id, reasonCode: 'CHEST_PAIN', department: 'EMERGENCY',
    suggestedPriority: 'URGENT', priority: 'URGENT', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(12), ...triage(8),
  });
  const vNaledi = mkVisit({
    patientId: naledi.id, reasonCode: 'PREG_EMERGENCY', department: 'MATERNITY',
    suggestedPriority: 'URGENT', priority: 'URGENT', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(25), ...triage(20),
  });
  const vPieter = mkVisit({
    patientId: pieter.id, reasonCode: 'ABDOMINAL', department: 'GENERAL',
    suggestedPriority: 'HIGH', priority: 'HIGH', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(50), ...triage(44),
  });
  const vAisha = mkVisit({
    patientId: aisha.id, reasonCode: 'HIGH_FEVER', department: 'GENERAL',
    suggestedPriority: 'HIGH', arrivedAt: minsAgo(8),
  });
  const vSipho = mkVisit({
    patientId: sipho.id, reasonCode: 'CHRONIC_CHECK', department: 'CHRONIC',
    suggestedPriority: 'ROUTINE', priority: 'ROUTINE', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(95), ...triage(90),
  });
  const vZanele = mkVisit({
    patientId: zanele.id, reasonCode: 'MEDS_REFILL', department: 'CHRONIC',
    suggestedPriority: 'ROUTINE', priority: 'ROUTINE', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(40), ...triage(36),
  });
  const vJohannes = mkVisit({
    patientId: johannes.id, reasonCode: 'RESP_INFECTION', department: 'GENERAL',
    suggestedPriority: 'ROUTINE', arrivedAt: minsAgo(20),
  });
  const vPrecious = mkVisit({
    patientId: precious.id, reasonCode: 'MATERNITY_CHECK', department: 'MATERNITY',
    suggestedPriority: 'ROUTINE', priority: 'HIGH', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(140), escalatedTo: 'HIGH', escalatedAt: minsAgo(50), ...triage(135),
  });
  const vKagiso = mkVisit({
    patientId: kagiso.id, reasonCode: 'MINOR_INJURY', department: 'GENERAL',
    suggestedPriority: 'ROUTINE', priority: 'ROUTINE', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(15), ...triage(12),
  });
  const vMandla = mkVisit({
    patientId: mandla.id, reasonCode: 'MENTAL_HEALTH', department: 'GENERAL',
    suggestedPriority: 'HIGH', arrivedAt: minsAgo(5),
  });
  const vRefilwe = mkVisit({
    patientId: refilwe.id, reasonCode: 'ABDOMINAL', department: 'GENERAL',
    suggestedPriority: 'HIGH', priority: 'HIGH', triageState: 'CONFIRMED', status: 'IN_CONSULTATION',
    arrivedAt: minsAgo(55), ...triage(50),
    consultationStartedAt: minsAgo(20), consultationStartedBy: 'Dr Sipho Ndlovu',
  });
  const vLungelo = mkVisit({
    patientId: lungelo.id, reasonCode: 'SICK_CHILD', department: 'PAEDIATRICS',
    suggestedPriority: 'HIGH', priority: 'HIGH', triageState: 'CONFIRMED',
    arrivedAt: minsAgo(30), ...triage(25),
  });
  const vGrace = mkVisit({
    patientId: grace.id, reasonCode: 'RESP_INFECTION', department: 'GENERAL',
    suggestedPriority: 'ROUTINE', priority: 'HIGH', triageState: 'OVERRIDDEN',
    overrideReason: 'Oxygen saturation low on arrival; admitted directly.',
    status: 'ADMITTED', arrivedAt: minsAgo(1560), ...triage(1550),
    admittedAt: minsAgo(1500),
  });
  const vThemba = mkVisit({
    patientId: themba.id, reasonCode: 'CHRONIC_CHECK', department: 'CHRONIC',
    suggestedPriority: 'ROUTINE', priority: 'HIGH', triageState: 'OVERRIDDEN',
    overrideReason: 'Blood glucose 22 mmol/L — admitted for stabilisation.',
    status: 'ADMITTED', arrivedAt: minsAgo(620), ...triage(610),
    admittedAt: minsAgo(600),
  });
  const vKarabo = mkVisit({
    patientId: karabo.id, reasonCode: 'REFERRAL', department: 'GENERAL',
    suggestedPriority: 'ROUTINE', priority: 'ROUTINE', triageState: 'CONFIRMED',
    status: 'DISCHARGED', arrivedAt: minsAgo(320), ...triage(310),
    consultationStartedAt: minsAgo(240), consultationStartedBy: 'Dr Sipho Ndlovu',
    dischargedAt: minsAgo(200),
  });
  const vDavid = mkVisit({
    patientId: david.id, reasonCode: 'CHEST_PAIN', department: 'EMERGENCY',
    suggestedPriority: 'URGENT', priority: 'URGENT', triageState: 'CONFIRMED',
    status: 'DISCHARGED', arrivedAt: minsAgo(400), ...triage(395),
    consultationStartedAt: minsAgo(370), consultationStartedBy: 'Dr Sipho Ndlovu',
    dischargedAt: minsAgo(330),
  });

  await db.visits.bulkAdd([
    vThabo, vNaledi, vPieter, vAisha, vSipho, vZanele, vJohannes, vPrecious, vKagiso,
    vMandla, vRefilwe, vLungelo, vGrace, vThemba, vKarabo, vDavid,
  ]);

  /* Admissions ---------------------------------------------------------- */
  const admGrace: Admission = {
    id: uid('adm'),
    patientId: grace.id,
    visitId: vGrace.id,
    ward: 'Medical Ward A',
    bed: 'A-12',
    treatingCondition: 'Community-acquired pneumonia',
    admittedAt: minsAgo(1500),
    admittedBy: 'Dr Sipho Ndlovu',
    medicationOrders: [
      { id: uid('mo'), name: 'Amoxicillin', dose: '500 mg', times: ['08:00', '14:00', '20:00'], notes: 'Complete the full course' },
      { id: uid('mo'), name: 'Paracetamol', dose: '1 g', times: ['08:00', '20:00'], notes: 'For fever above 38°C' },
    ],
    doses: [],
    meals: [],
    dischargedAt: null,
    dischargedBy: null,
  };
  const [amox, para] = admGrace.medicationOrders;
  admGrace.doses = [
    { id: uid('d'), orderId: amox.id, scheduledTime: '08:00', givenAt: minsAgo(420), givenBy: 'Sister Bongi Zulu' },
    { id: uid('d'), orderId: para.id, scheduledTime: '08:00', givenAt: minsAgo(420), givenBy: 'Sister Bongi Zulu' },
    { id: uid('d'), orderId: amox.id, scheduledTime: '14:00', givenAt: minsAgo(60), givenBy: 'Sister Bongi Zulu' },
  ];
  admGrace.meals = [
    { id: uid('m'), meal: 'BREAKFAST', servedAt: minsAgo(380), servedBy: 'Sister Bongi Zulu' },
    { id: uid('m'), meal: 'LUNCH', servedAt: minsAgo(120), servedBy: 'Sister Bongi Zulu' },
  ];
  vGrace.admissionId = admGrace.id;

  const admThemba: Admission = {
    id: uid('adm'),
    patientId: themba.id,
    visitId: vThemba.id,
    ward: 'Medical Ward B',
    bed: 'B-04',
    treatingCondition: 'Type 2 diabetes — hyperglycaemic episode',
    admittedAt: minsAgo(600),
    admittedBy: 'Dr Sipho Ndlovu',
    medicationOrders: [
      { id: uid('mo'), name: 'Insulin (Actrapid)', dose: '10 units', times: ['07:00', '13:00', '19:00'], notes: 'Subcutaneous, before meals' },
      { id: uid('mo'), name: 'Metformin', dose: '850 mg', times: ['08:00', '20:00'], notes: 'With food' },
    ],
    doses: [],
    meals: [],
    dischargedAt: null,
    dischargedBy: null,
  };
  const [insulin, metformin] = admThemba.medicationOrders;
  admThemba.doses = [
    { id: uid('d'), orderId: insulin.id, scheduledTime: '07:00', givenAt: minsAgo(420), givenBy: 'Sister Bongi Zulu' },
    { id: uid('d'), orderId: metformin.id, scheduledTime: '08:00', givenAt: minsAgo(400), givenBy: 'Sister Bongi Zulu' },
  ];
  admThemba.meals = [
    { id: uid('m'), meal: 'BREAKFAST', servedAt: minsAgo(400), servedBy: 'Sister Bongi Zulu' },
  ];
  vThemba.admissionId = admThemba.id;

  await db.admissions.bulkAdd([admGrace, admThemba]);
  await db.visits.bulkPut([vGrace, vThemba]);

  /* Audit trail (two entries deliberately unsynced to demo the sync flow) */
  const entries: AuditEntry[] = [
    {
      id: uid('a'), at: minsAgo(1500), actorId: 'u-clinician', actorName: 'Dr Sipho Ndlovu',
      actorRole: 'CLINICIAN', action: 'ADMITTED', entityType: 'ADMISSION', entityId: admGrace.id,
      patientId: grace.id, details: 'Admitted to Medical Ward A, bed A-12 — community-acquired pneumonia', synced: 1,
    },
    {
      id: uid('a'), at: minsAgo(400), actorId: 'u-reception', actorName: 'Lerato Mahlangu',
      actorRole: 'RECEPTION', action: 'VISIT_CREATED', entityType: 'VISIT', entityId: vDavid.id,
      patientId: david.id, details: 'Visit created — Chest pain / difficulty breathing (Emergency)', synced: 1,
    },
    {
      id: uid('a'), at: minsAgo(330), actorId: 'u-clinician', actorName: 'Dr Sipho Ndlovu',
      actorRole: 'CLINICIAN', action: 'DISCHARGED', entityType: 'VISIT', entityId: vDavid.id,
      patientId: david.id, details: 'Discharged after consultation — referred to cardiology', synced: 1,
    },
    {
      id: uid('a'), at: minsAgo(60), actorId: 'u-triage', actorName: 'Sister Bongi Zulu',
      actorRole: 'TRIAGE', action: 'DOSE_GIVEN', entityType: 'ADMISSION', entityId: admGrace.id,
      patientId: grace.id, details: 'Amoxicillin 500 mg — 14:00 dose given', synced: 0,
    },
    {
      id: uid('a'), at: minsAgo(120), actorId: 'u-triage', actorName: 'Sister Bongi Zulu',
      actorRole: 'TRIAGE', action: 'MEAL_RECORDED', entityType: 'ADMISSION', entityId: admGrace.id,
      patientId: grace.id, details: 'Lunch served', synced: 0,
    },
  ];
  await db.audit.bulkAdd(entries);

  await db.kv.bulkPut([
    { key: 'seeded', value: true },
    { key: 'lastSyncAt', value: minsAgo(30) },
    { key: 'simulateOffline', value: false },
  ]);
}

export async function seedIfEmpty(): Promise<void> {
  const marker = await db.kv.get('seeded');
  if (!marker) await seed();
}

export async function resetDemoData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.patients, db.visits, db.admissions, db.audit, db.config, db.kv],
    async () => {
      await Promise.all([
        db.patients.clear(),
        db.visits.clear(),
        db.admissions.clear(),
        db.audit.clear(),
        db.config.clear(),
        db.kv.clear(),
      ]);
      await seed();
    }
  );
}
