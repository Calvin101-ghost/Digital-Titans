# Beyond the Queue — Patient Flow & Records MVP

A working prototype of the patient flow and records system proposed for South African
hospitals and clinics. It reduces congestion by separating urgent patients from the
general queue, digitally replacing paper files, and designing for the realities of
load-shedding and unreliable connectivity.

This is a **front-end MVP**: all data lives on the device (IndexedDB) and "sync" is
simulated, so the offline-first workflow can be demonstrated end to end without a
backend. See [Production notes](#production-notes-popia--real-deployment) for what a
real deployment adds.

---

## What the MVP covers

| Proposal requirement | Implementation |
| --- | --- |
| First-time digital records | Registration form: name, address, ID number, next of kin, email, contact, blood type, age, gender (auto-derived from a valid SA ID), medical status, past history, previous medication, POPIA consent |
| Reason for visit → suggested priority | 16 fixed categories, each mapping to a department and a suggested priority level |
| Returning patients found by ID number | Reception search across ID number, file number, name and phone; a duplicate-ID check blocks a second record for the same person |
| Staff dashboard by field | Each clinician sees only their own department's queue; reception/triage/admin can select a department |
| Priority vs general queue | Urgent + high in the priority queue, routine in the general queue, longest wait first within each tier |
| Waiting times & status updates | Live waiting timers on every card; Waiting → In consultation → Discharged (and Admitted) |
| Admitted patients page | Who is admitted, treating condition, daily medication orders with per-dose tracking, meals recorded per day |
| Automatic escalation | Routine → high after 90 min, high → urgent after 45 min; configurable in Settings; escalations are audited and never downgraded at triage |
| Triage nurse confirms priority | Suggested level from the reason for visit; triage confirms or overrides with a recorded reason; patients cannot set their own priority |
| Pre-registration + SMS | Kiosk screen captures a pre-registration; reception sees the queue, sends an estimated-wait SMS, and marks arrival so the visit starts from the correct time |
| POPIA & access control | Role-based access, masked ID numbers (reveal is permission-gated and logged), full audit log of every record opened or changed |
| Offline capability | Installable PWA; all actions persist on the device and sync when the connection returns |

## Quick start

Requires Node 20.19+ (Node 24 recommended — tests use native TypeScript).

```bash
npm install       # install dependencies
npm run dev       # development server (http://localhost:5173)
npm test          # unit tests for the domain rules (flow logic)
npm run typecheck # strict TypeScript check
npm run build     # production build (typecheck + vite build)
npm run preview   # serve the production build (http://localhost:4173)
```

> On Windows PowerShell use `npm.cmd` if script execution is restricted.

## Demo script

Each screen is tested with these personas (one click on the login page):

| Persona | Role | What to show |
| --- | --- | --- |
| Nomsa Khumalo | Reception | ID search (`9203155800083`), duplicate-ID check, new visit + wait slip with SMS, pre-registration queue |
| Dr. Thandi Dube | Triage nurse | Confirm suggested priorities, override with reason, automatic escalation badge |
| Dr. Sipho Ndlovu | Clinician (General) | Own-department queues, start consultation (records arrival→first-contact time), admit / discharge |
| Admin | Administrator | Audit log with CSV export, settings, escalation thresholds |

Two pre-registered patients arrive in the demo data, and two audit entries start
unsynced so you can watch **2 to sync → Synced** happen automatically within seconds.

### 10-minute walkthrough

1. **Login as Reception.** Search `9203155800083` → Thabo Mokoena's record opens with the
   ID masked (`920315••••083`). "Reveal" is logged in the audit trail.
2. **Pre-registrations tab.** Naledi Dlamini is waiting; send her an SMS with the
   estimated wait, then mark arrival — she enters today's arrivals list.
3. **Login as Dr. Thandi Dube (triage).** Aisha Patel and Johannes Botha are awaiting
   triage with suggested priorities. Confirm one; override another with a reason.
4. **Login as Dr. Sipho Ndlovu.** Pieter van der Merwe has been escalated to urgent
   automatically (badge on the card, and a toast appears on first load). Start his
   consultation — the arrival→first-contact metric is recorded. Admit or discharge him.
5. **Admitted patients.** Grace Mahlaba has a partial day: give a dose (1/5 → 2/5),
   record a meal, then discharge her.
6. **Audit log.** Every action above is time-stamped and attributed. Filter to
   "Pending sync" entries, then press the green pill in the header to sync them.
7. **Simulate offline** (Wi-Fi button in the header). Register a patient or update a
   status — the amber "offline" banner appears, actions queue. Toggle back and watch
   the queue drain.
8. **Settings.** Change the escalation thresholds (e.g. 90 → 45) and save; the new
   value is audited and applies immediately.

## Architecture

```
src/
├── lib/
│   ├── types.ts      Domain model (Patient, Visit, Admission, AuditEntry, …)
│   ├── catalog.ts    Reasons for visit, departments, permissions, personas
│   ├── logic.ts      Pure rules: escalation, queue sorting, estimates, metrics
│   ├── db.ts         Dexie/IndexedDB schema, seed data, reset
│   ├── audit.ts      Append-only audit trail helpers
│   ├── sync.tsx      Sync engine (outbox = unsynced audit entries) + offline toggle
│   ├── auth.tsx      Session + permission checks (role-based access)
│   ├── toast.tsx     Notifications
│   └── hooks.ts      Live queries and shared hooks
├── components/       UI primitives, patient/visit dialogs, app shell
├── pages/            Login, Kiosk, Reception, Triage, Dashboard, Admitted,
│                     PatientRecord, AuditLog, Settings
└── public/sw.js      Service worker (app-shell cache, network-first navigation)
```

**Key design decisions**

- **Offline-first, not offline-fallback.** Every write goes to IndexedDB first; the
  audit table with `synced: 0` doubles as the sync outbox. The UI never blocks on
  the network.
- **Escalation is computed, then persisted.** `computeEscalation` is a pure function
  (unit-tested); a background watcher persists due escalations with a system actor so
  the audit trail stays honest.
- **The audit log is the record.** Every open, change, dose and meal is appended with
  actor, timestamp and sync state — this is the “time-stamped and attributed” promise
  from the proposal made concrete.
- **Clinical details are gated.** Reception can register and see demographics, but
  medical history is only visible to roles with the `viewClinical` permission.

## Production notes (POPIA & real deployment)

This MVP simulates the pieces that need infrastructure. Before a pilot:

- **Backend sync**: replace `src/lib/sync.tsx` with a real API (the outbox pattern
  stays — only the flush target changes). Queue entries carry the audit ID for
  idempotent retries.
- **Encryption**: TLS in transit; encrypted database / field-level encryption at rest
  on the server. IndexedDB on shared clinic devices should be encrypted or cleared
  between shifts.
- **Hosting in South Africa** and a signed data-processing agreement; the audit
  endpoint must be append-only with retention rules agreed with counsel.
- **SMS gateway**: the wait-estimate SMS is stubbed (`SmsBubble`); wire it to a local
  provider and log delivery in the audit trail.
- **Real authentication**: the persona picker is a demo aid; replace with per-staff
  credentials, session expiry, and device binding.
- **Breach-response procedure**, least-privilege review, and regular security testing
  as set out in the proposal's risk register.

## Measuring success (built in)

The dashboard computes the pilot metrics directly:

- Time from arrival to first clinical contact, split by priority (median shown)
- Share of urgent patients seen within the target time (configurable, default 60 min)
- Records found first time (ID search) and duplicate records prevented (live check)
- Waiting time per patient, visible to staff and sent to pre-registered patients

## License

Prototype for evaluation — not for clinical use without the production hardening
above.
