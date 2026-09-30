/* Session + role-based access. The signed-in staff member's role decides
   what they can see and do; permissions are defined per role in catalog.ts. */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StaffUser } from './types';
import { PERMISSIONS, type Perm } from './catalog';
import type { Actor } from './audit';

interface AuthContextValue {
  user: StaffUser | null;
  login: (user: StaffUser) => void;
  logout: () => void;
  can: (permission: Perm) => boolean;
}

const LS_KEY = 'bq.session.v1';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as StaffUser) : null;
    } catch {
      return null;
    }
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: (next) => {
        setUser(next);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable — session stays in memory only */
        }
      },
      logout: () => {
        setUser(null);
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
      },
      can: (permission) => !!user && PERMISSIONS[user.role].includes(permission),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function actorOf(user: StaffUser): Actor {
  return { id: user.id, name: user.name, role: user.role };
}
