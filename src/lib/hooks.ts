/* Shared hooks: a ticking clock for waiting times, the facility config,
   and live-query helpers over the local database. */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { CONFIG_DEFAULTS } from './catalog';
import type { FacilityConfig, Patient, Visit } from './types';

/** Re-renders on an interval so waiting times tick without user action. */
export function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useConfig(): FacilityConfig {
  return useLiveQuery(() => db.config.get('facility'), [], CONFIG_DEFAULTS) ?? CONFIG_DEFAULTS;
}

export function usePatientsIndex(): Map<string, Patient> {
  const list = useLiveQuery(() => db.patients.toArray(), [], [] as Patient[]);
  return useMemo(() => new Map((list ?? []).map((p) => [p.id, p])), [list]);
}

export function useAllVisits(): Visit[] {
  return useLiveQuery(() => db.visits.toArray(), [], [] as Visit[]) ?? [];
}
