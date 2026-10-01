import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useCollection } from './db';
import { seedEmployees } from '../seed/employees';
import { hashPin } from './pin';
import type { Employee } from './types';

const SESSION_KEY = 'drix:session';


interface AuthValue {
  user: Employee | null;
  employees: Employee[];
  ready: boolean;
  isManager: boolean;
  login(employeeId: string, pin: string): Promise<boolean>;
  logout(): void;
  changePin(pin: string): Promise<void>;
  skipPinChange(): Promise<void>;
  saveEmployee(e: Employee): Promise<void>;
  removeEmployee(id: string): Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { items: employees, loading, save, remove } = useCollection<Employee>('employees', seedEmployees);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* private mode - session just won't persist */
    }
  }, [sessionId]);

  const user = useMemo(() => employees.find((e) => e.id === sessionId) ?? null, [employees, sessionId]);

  const login = useCallback(
    async (employeeId: string, pin: string) => {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return false;
      if ((await hashPin(emp.id, pin)) !== emp.pinHash) return false;
      setSessionId(emp.id);
      return true;
    },
    [employees],
  );

  const changePin = useCallback(
    async (pin: string) => {
      if (!user) return;
      await save({ ...user, pinHash: await hashPin(user.id, pin), mustChangePin: false });
    },
    [user, save],
  );

  const skipPinChange = useCallback(async () => {
    if (user) await save({ ...user, mustChangePin: false });
  }, [user, save]);

  const value: AuthValue = {
    user,
    employees,
    ready: !loading,
    isManager: user?.role === 'manager',
    login,
    logout: () => {
      setSessionId(null);
      window.location.hash = '#/'; // the next person starts on the home screen
    },
    changePin,
    skipPinChange,
    saveEmployee: save,
    removeEmployee: remove,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
