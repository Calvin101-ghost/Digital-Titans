/* Connectivity + sync. Actions are written to IndexedDB immediately, so
   the app keeps working offline. Unsynchronised audit entries form the
   outbox and are flushed when the connection returns. A manual toggle can
   simulate offline mode for demos on a working connection. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, nowIso } from './db';
import { useToast } from './toast';

interface SyncContextValue {
  online: boolean;
  simulatedOffline: boolean;
  pending: number;
  flushing: boolean;
  lastSyncAt: string | null;
  setSimulatedOffline: (value: boolean) => void;
  flushNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SyncProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [browserOnline, setBrowserOnline] = useState<boolean>(() => navigator.onLine);
  const [simulatedOffline, setSimulated] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const flushingRef = useRef(false);

  const pending = useLiveQuery(() => db.audit.where('synced').equals(0).count(), [], 0) ?? 0;
  const online = browserOnline && !simulatedOffline;

  useEffect(() => {
    void db.kv.get('simulateOffline').then((row) => {
      if (row?.value === true) setSimulated(true);
    });
    void db.kv.get('lastSyncAt').then((row) => {
      if (typeof row?.value === 'string') setLastSyncAt(row.value);
    });
  }, []);

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const flush = useCallback(
    async (manual: boolean) => {
      if (flushingRef.current) return;
      const count = await db.audit.where('synced').equals(0).count();
      if (count === 0) {
        if (manual) push('Everything is already synced.', 'info');
        return;
      }
      flushingRef.current = true;
      setFlushing(true);
      try {
        const unsynced = await db.audit.where('synced').equals(0).sortBy('at');
        for (const entry of unsynced) {
          await sleep(manual ? 60 : 30);
          await db.audit.update(entry.id, { synced: 1 });
        }
        const stamp = nowIso();
        await db.kv.put({ key: 'lastSyncAt', value: stamp });
        setLastSyncAt(stamp);
        if (manual) {
          push(`Synced ${unsynced.length} ${unsynced.length === 1 ? 'change' : 'changes'} to the server.`, 'success');
        }
      } finally {
        flushingRef.current = false;
        setFlushing(false);
      }
    },
    [push]
  );

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => {
      void flush(false);
    }, 6000);
    return () => clearInterval(timer);
  }, [online, flush]);

  // Flush as soon as connectivity is restored.
  useEffect(() => {
    if (online && pending > 0) void flush(false);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSimulatedOffline = useCallback((value: boolean) => {
    setSimulated(value);
    void db.kv.put({ key: 'simulateOffline', value });
  }, []);

  const flushNow = useCallback(async () => {
    if (!online) {
      push('Still offline — changes stay on this device until the connection returns.', 'warn');
      return;
    }
    await flush(true);
  }, [online, flush, push]);

  return (
    <SyncContext.Provider
      value={{ online, simulatedOffline, pending, flushing, lastSyncAt, setSimulatedOffline, flushNow }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
