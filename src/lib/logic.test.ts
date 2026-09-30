/* Unit tests for the pure domain logic — the rules the pilot depends on:
   ID masking, automatic escalation thresholds, queue ordering and the
   success metrics. Run with: npm test
   (Node 24 runs TypeScript natively via type stripping.) */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  computeEscalation,
  dateKey,
  deriveAgeFromId,
  deriveGenderFromId,
  effectivePriority,
  escalationDue,
  estimateWait,
  firstContactMinutes,
  formatWaiting,
  maskIdNumber,
  median,
  sortQueue,
  urgentWithinTarget,
} from './logic.ts';
import type { Visit } from './types';

const NOW = new Date('2026-09-30T12:00:00');
const CFG = {
  escalationRoutineToHighMinutes: 90,
  escalationHighToUrgentMinutes: 45,
};

const minutesAgo = (mins: number) => new Date(NOW.getTime() - mins * 60000).toISOString();

function mkVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'v1',
    reference: 'V-TEST',
    patientId: 'p1',
    department: 'GENERAL',
    reasonCode: 'HIGH_FEVER',
    suggestedPriority: 'HIGH',
    priority: 'HIGH',
    escalatedTo: null,
    escalatedAt: null,
    triageState: 'CONFIRMED',
    overrideReason: null,
    status: 'WAITING',
    scheduledFor: null,
    arrivedAt: minutesAgo(10),
    triagedAt: null,
    triagedBy: null,
    consultationStartedAt: null,
    consultationStartedBy: null,
    admittedAt: null,
    dischargedAt: null,
    admissionId: null,
    createdAt: minutesAgo(10),
    createdBy: 'test',
    ...overrides,
  };
}

test('maskIdNumber masks the middle of an SA ID number', () => {
  assert.equal(maskIdNumber('8501015800089'), '850101••••089');
  assert.equal(maskIdNumber('A1234567'), 'A12345••••567');
  assert.ok(!maskIdNumber('9203155800083').includes('5800'));
});

test('deriveAgeFromId calculates age with and without the birthday passed', () => {
  assert.equal(deriveAgeFromId('9203155800083', new Date('2026-06-01')), 34);
  assert.equal(deriveAgeFromId('9203155800083', new Date('2026-01-01')), 33);
  assert.equal(deriveAgeFromId('not-an-id', new Date('2026-06-01')), null);
});

test('deriveGenderFromId uses digits 7-10 of the ID', () => {
  assert.equal(deriveGenderFromId('9203155800083'), 'MALE'); // 5800
  assert.equal(deriveGenderFromId('9806240234087'), 'FEMALE'); // 0234
  assert.equal(deriveGenderFromId('123'), null);
});

test('routine patients escalate to high after the configured threshold', () => {
  const under = mkVisit({ priority: 'ROUTINE', arrivedAt: minutesAgo(89) });
  assert.equal(computeEscalation(under, NOW, CFG), null);
  const over = mkVisit({ priority: 'ROUTINE', arrivedAt: minutesAgo(91) });
  assert.equal(computeEscalation(over, NOW, CFG)?.to, 'HIGH');
});

test('high patients escalate to urgent after their threshold', () => {
  const under = mkVisit({ priority: 'HIGH', arrivedAt: minutesAgo(44) });
  assert.equal(computeEscalation(under, NOW, CFG), null);
  const over = mkVisit({ priority: 'HIGH', arrivedAt: minutesAgo(46) });
  assert.equal(computeEscalation(over, NOW, CFG)?.to, 'URGENT');
});

test('a routine patient escalated to high gets a fresh window before urgent', () => {
  const fresh = mkVisit({
    priority: 'HIGH',
    escalatedTo: 'HIGH',
    escalatedAt: minutesAgo(20),
    arrivedAt: minutesAgo(110),
  });
  assert.equal(computeEscalation(fresh, NOW, CFG), null);

  const stale = mkVisit({
    priority: 'HIGH',
    escalatedTo: 'HIGH',
    escalatedAt: minutesAgo(46),
    arrivedAt: minutesAgo(136),
  });
  assert.equal(computeEscalation(stale, NOW, CFG)?.to, 'URGENT');
});

test('urgent patients never escalate and non-waiting visits are exempt', () => {
  const urgent = mkVisit({ priority: 'URGENT', arrivedAt: minutesAgo(300) });
  assert.equal(computeEscalation(urgent, NOW, CFG), null);
  const discharged = mkVisit({ priority: 'ROUTINE', status: 'DISCHARGED', arrivedAt: minutesAgo(300) });
  assert.equal(computeEscalation(discharged, NOW, CFG), null);
});

test('effectivePriority reflects an escalation that is due but not yet persisted', () => {
  const v = mkVisit({ priority: 'ROUTINE', arrivedAt: minutesAgo(95) });
  assert.equal(effectivePriority(v, NOW, CFG), 'HIGH');
});

test('sortQueue: urgent first, then high and routine; longest wait first within a tier', () => {
  const routineOlder = mkVisit({ id: 'r1', priority: 'ROUTINE', arrivedAt: minutesAgo(80) });
  const urgentNewer = mkVisit({ id: 'u1', priority: 'URGENT', arrivedAt: minutesAgo(3) });
  const highNewer = mkVisit({ id: 'h1', priority: 'HIGH', arrivedAt: minutesAgo(5) });
  const highOlder = mkVisit({ id: 'h2', priority: 'HIGH', arrivedAt: minutesAgo(40) });
  const sorted = sortQueue([routineOlder, urgentNewer, highNewer, highOlder], NOW, CFG);
  assert.deepEqual(
    sorted.map((v) => v.id),
    ['u1', 'h2', 'h1', 'r1']
  );
});

test('escalationDue returns only the visits past a threshold', () => {
  const due = escalationDue(
    [
      mkVisit({ id: 'a', priority: 'ROUTINE', arrivedAt: minutesAgo(95) }),
      mkVisit({ id: 'b', priority: 'ROUTINE', arrivedAt: minutesAgo(10) }),
    ],
    NOW,
    CFG
  );
  assert.equal(due.length, 1);
  assert.equal(due[0].visit.id, 'a');
  assert.equal(due[0].to, 'HIGH');
});

test('estimateWait counts only same-department waiting patients ahead', () => {
  const cfg = { avgConsultMinutes: 15, ...CFG };
  const estimate = estimateWait(
    'GENERAL',
    [
      mkVisit({ id: 'a' }),
      mkVisit({ id: 'b' }),
      mkVisit({ id: 'c', department: 'MATERNITY' }),
      mkVisit({ id: 'd', status: 'DISCHARGED' }),
    ],
    NOW,
    cfg
  );
  assert.equal(estimate.ahead, 2);
  assert.equal(estimate.position, 3);
  assert.equal(estimate.minutes, 30);
});

test('median handles odd and even counts', () => {
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([10, 20]), 15);
  assert.equal(median([]), null);
});

test('urgentWithinTarget measures the share of urgent patients seen in time', () => {
  const inTime = mkVisit({
    id: 'a',
    priority: 'URGENT',
    arrivedAt: minutesAgo(120),
    consultationStartedAt: minutesAgo(80), // 40 min
  });
  const late = mkVisit({
    id: 'b',
    priority: 'URGENT',
    arrivedAt: minutesAgo(120),
    consultationStartedAt: minutesAgo(30), // 90 min
  });
  const stats = urgentWithinTarget([inTime, late], 60);
  assert.equal(stats.seen, 2);
  assert.equal(stats.within, 1);
  assert.equal(stats.share, 0.5);
});

test('firstContactMinutes is null until a consultation starts', () => {
  assert.equal(firstContactMinutes(mkVisit()), null);
  assert.equal(
    firstContactMinutes(
      mkVisit({ arrivedAt: minutesAgo(60), consultationStartedAt: minutesAgo(20) })
    ),
    40
  );
});

test('dateKey produces a local calendar key', () => {
  assert.equal(dateKey(new Date(2026, 8, 30, 23, 59)), '2026-09-30');
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('formatWaiting renders minutes and hours', () => {
  assert.equal(formatWaiting(0), '<1 min');
  assert.equal(formatWaiting(45), '45 min');
  assert.equal(formatWaiting(95), '1h 35m');
});
