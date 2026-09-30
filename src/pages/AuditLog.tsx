/* Audit log (records officer). Every record opened or changed, by whom and
   when — append-only, with a sync indicator per entry. */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cloud, CloudOff, Download } from 'lucide-react';
import { db } from '../lib/db';
import { AUDIT_LABEL, auditBadge } from '../lib/audit';
import { usePatientsIndex } from '../lib/hooks';
import { formatDateTime } from '../lib/logic';
import type { AuditAction, AuditEntry } from '../lib/types';
import { EmptyState } from '../components/ui';

const ACTIONS = Object.keys(AUDIT_LABEL) as AuditAction[];

export function AuditLog({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
  const patientsIndex = usePatientsIndex();
  const entries = useLiveQuery(
    async () => {
      const rows = await db.audit.toArray();
      return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);
    },
    [],
    [] as AuditEntry[]
  );

  const [q, setQ] = useState('');
  const [action, setAction] = useState<'ALL' | AuditAction>('ALL');
  const [actor, setActor] = useState('ALL');
  const [pendingOnly, setPendingOnly] = useState(false);

  const actors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.actorName))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (action !== 'ALL' && e.action !== action) return false;
      if (actor !== 'ALL' && e.actorName !== actor) return false;
      if (pendingOnly && e.synced === 1) return false;
      if (query) {
        const patient = e.patientId ? patientsIndex.get(e.patientId) : undefined;
        const haystack = `${e.details} ${e.actorName} ${
          patient ? `${patient.firstName} ${patient.lastName} ${patient.fileNumber}` : ''
        }`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entries, q, action, actor, pendingOnly, patientsIndex]);

  const pendingCount = entries.filter((e) => e.synced === 0).length;

  const exportCsv = () => {
    const header = 'time,actor,role,action,entity,entity_id,details,synced';
    const rows = filtered.map((e) =>
      [e.at, e.actorName, e.actorRole, e.action, e.entityType, e.entityId, e.details, e.synced ? 'yes' : 'no']
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `beyond-the-queue-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Audit log</h1>
          <p className="text-sm text-slate-500">
            Append-only, time-stamped and attributed to a staff member. Every record opened or changed is
            listed here.
            {pendingCount > 0 ? ` ${pendingCount} entries await sync.` : ' All entries synced.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-52 flex-1">
          <span className="mb-1 block text-[11px] font-semibold text-slate-500">Search</span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Patient, staff member or details…"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold text-slate-500">Action</span>
          <select className="input !w-56" value={action} onChange={(e) => setAction(e.target.value as 'ALL' | AuditAction)}>
            <option value="ALL">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold text-slate-500">Staff member</span>
          <select className="input !w-52" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="ALL">Everyone</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-700"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Not yet synced
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No audit entries match these filters" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Staff member</th>
                <th>Action</th>
                <th>Details</th>
                <th>Sync</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const patient = entry.patientId ? patientsIndex.get(entry.patientId) : undefined;
                return (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-xs tabular-nums text-slate-500">
                      {formatDateTime(entry.at)}
                    </td>
                    <td className="text-xs text-slate-600">
                      {entry.actorName}
                      <div className="text-[11px] text-slate-400">{entry.actorRole.toLowerCase()}</div>
                    </td>
                    <td>
                      <span className={`pill ${auditBadge(entry.action)}`}>{AUDIT_LABEL[entry.action]}</span>
                    </td>
                    <td className="text-xs text-slate-600">
                      {entry.details}
                      {patient ? (
                        <div>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-teal-700 hover:underline"
                            onClick={() => onOpenPatient(patient.id)}
                          >
                            {patient.firstName} {patient.lastName} · {patient.fileNumber}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {entry.synced ? (
                        <span className="pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" title="Synced to server">
                          <Cloud className="h-3 w-3" /> Synced
                        </span>
                      ) : (
                        <span className="pill bg-amber-50 text-amber-800 ring-1 ring-amber-200" title="Stored on this device, awaiting connection">
                          <CloudOff className="h-3 w-3" /> On device
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Showing the most recent 500 entries. In production the audit trail lives on the server as well, with
        regular security testing and least-privilege access enforced at the API.
      </p>
    </div>
  );
}
