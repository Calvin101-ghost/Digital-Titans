import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { SyncProvider } from './lib/sync';
import { ToastProvider } from './lib/toast';
import { Shell, defaultTab, type TabKey } from './components/Layout';
import { Login } from './pages/Login';
import { Kiosk } from './pages/Kiosk';
import { Reception } from './pages/Reception';
import { Triage } from './pages/Triage';
import { Dashboard } from './pages/Dashboard';
import { Admitted } from './pages/Admitted';
import { PatientRecord } from './pages/PatientRecord';
import { AuditLog } from './pages/AuditLog';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SyncProvider>
          <Root />
        </SyncProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

function Root() {
  const { user, logout } = useAuth();
  const [kiosk, setKiosk] = useState(false);
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [patientId, setPatientId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setTab(defaultTab(user.role));
      setPatientId(null);
    }
  }, [user]);

  if (kiosk) return <Kiosk onExit={() => setKiosk(false)} />;
  if (!user) return <Login onKiosk={() => setKiosk(true)} />;

  const openPatient = (id: string) => setPatientId(id);
  const goTab = (next: TabKey) => {
    setTab(next);
    setPatientId(null);
  };

  return (
    <Shell user={user} tab={tab} onTab={goTab} onSignOut={logout}>
      {patientId ? (
        <PatientRecord patientId={patientId} onBack={() => setPatientId(null)} />
      ) : tab === 'reception' ? (
        <Reception onOpenPatient={openPatient} />
      ) : tab === 'triage' ? (
        <Triage onOpenPatient={openPatient} />
      ) : tab === 'dashboard' ? (
        <Dashboard user={user} onOpenPatient={openPatient} onGoToTriage={() => goTab('triage')} />
      ) : tab === 'admitted' ? (
        <Admitted onOpenPatient={openPatient} />
      ) : tab === 'audit' ? (
        <AuditLog onOpenPatient={openPatient} />
      ) : (
        <Settings />
      )}
    </Shell>
  );
}
