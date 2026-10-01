import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clearDataCache, isShared, setSeedAllowed } from './db';
import { employeeApi as api } from './employeesApi';
import type { ActionResult, LoginResult } from './employeesApi';
import { setUnauthorizedHandler } from './session';
import { clearWixCache } from './wix';
import { seedAll } from '../seed';
import type { PublicEmployee, Role } from './types';

interface AuthValue {
  user: PublicEmployee | null;
  employees: PublicEmployee[];
  ready: boolean;
  isManager: boolean;
  /** managers and the people a manager allowed to edit the inventory list */
  canEditInventory: boolean;
  login(employeeId: string, pin: string): Promise<LoginResult>;
  logout(): void;
  /** false = the server refused the PIN (must be 4 digits, not 0000). */
  changePin(pin: string): Promise<boolean>;
  skipPinChange(): Promise<void>;
  addEmployee(name: string, role: Role): Promise<ActionResult>;
  setRole(id: string, role: Role): Promise<ActionResult>;
  resetPin(id: string): Promise<ActionResult>;
  removeEmployee(id: string): Promise<ActionResult>;
  setInventoryEditor(id: string, value: boolean): Promise<ActionResult>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicEmployee | null>(null);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [ready, setReady] = useState(false);

  const applyUser = useCallback((u: PublicEmployee | null) => {
    // Only a signed-in manager may write the starting content of the shared server.
    if (!u) {
      clearDataCache();
      clearWixCache();
    }
    const mayWrite = !isShared || u?.role === 'manager';
    setSeedAllowed(mayWrite);
    if (u && mayWrite) void seedAll().catch(() => undefined);
    setUser(u);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await api.list();
      setEmployees(list);
      setUser((prev) => {
        if (!prev) return prev;
        const found = list.find((e) => e.id === prev.id);
        if (!found) return list.length > 0 ? null : prev; // deleted by a manager
        // a list fetched before sign-in does not know mustChangePin - never lose it
        return { ...prev, ...found, mustChangePin: found.mustChangePin ?? prev.mustChangePin };
      });
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => applyUser(null));
    let alive = true;
    void (async () => {
      const me = await api.restore();
      if (alive) applyUser(me);
      await refresh();
      if (alive) setReady(true);
    })();
    const stop = api.subscribe(() => void refresh());
    return () => {
      alive = false;
      stop();
      setUnauthorizedHandler(null);
    };
  }, [applyUser, refresh]);

  const login = useCallback(
    async (id: string, pin: string) => {
      const r = await api.login(id, pin);
      if (r.ok) {
        applyUser(r.employee);
        void refresh();
      }
      return r;
    },
    [applyUser, refresh],
  );

  const changePin = useCallback(
    async (pin: string) => {
      const r = await api.setPin(pin);
      await refresh();
      return r.ok;
    },
    [refresh],
  );

  const afterAdmin = useCallback(
    async (action: Promise<ActionResult>) => {
      const r = await action;
      await refresh();
      return r;
    },
    [refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      employees,
      ready,
      isManager: user?.role === 'manager',
      canEditInventory: user?.role === 'manager' || user?.inventoryEditor === true,
      login,
      logout: () => {
        void api.logout();
        applyUser(null);
        window.location.hash = '#/'; // the next person starts on the home screen
      },
      changePin,
      skipPinChange: async () => {
        await api.skipPinChange();
        await refresh();
      },
      addEmployee: (name, role) => afterAdmin(api.add(name, role)),
      setRole: (id, role) => afterAdmin(api.setRole(id, role)),
      resetPin: (id) => afterAdmin(api.resetPin(id)),
      removeEmployee: (id) => afterAdmin(api.remove(id)),
      setInventoryEditor: (id, value) => afterAdmin(api.setInventoryEditor(id, value)),
    }),
    [user, employees, ready, login, changePin, afterAdmin, applyUser, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
