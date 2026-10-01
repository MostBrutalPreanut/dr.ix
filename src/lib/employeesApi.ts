import { backend, isShared, newId, seedIfEmpty } from './db';
import { poll, rpc } from './gateway';
import { DEFAULT_PIN, hashPin } from './pin';
import { getToken, setToken } from './session';
import { seedEmployees } from '../seed/employees';
import type { Employee, PublicEmployee, Role } from './types';

export type LoginResult =
  | { ok: true; employee: PublicEmployee }
  | { ok: false; reason: 'bad_pin' | 'locked' | 'error'; retryAfterSeconds?: number };

export type ActionResult = { ok: true } | { ok: false; reason: string };

/** Everything the app does with employees. Two implementations: this device only, or the server. */
export interface EmployeeApi {
  list(): Promise<PublicEmployee[]>;
  restore(): Promise<PublicEmployee | null>;
  login(id: string, pin: string): Promise<LoginResult>;
  logout(): Promise<void>;
  setPin(pin: string): Promise<ActionResult>;
  skipPinChange(): Promise<void>;
  add(name: string, role: Role): Promise<ActionResult>;
  setRole(id: string, role: Role): Promise<ActionResult>;
  resetPin(id: string): Promise<ActionResult>;
  remove(id: string): Promise<ActionResult>;
  setInventoryEditor(id: string, value: boolean): Promise<ActionResult>;
  subscribe(fn: () => void): () => void;
}

const validPin = (pin: string) => /^[0-9]{4}$/.test(pin) && pin !== DEFAULT_PIN;

// ---------------------------------------------------------------- shared: the server decides

function sharedApi(): EmployeeApi {
  return {
    async list() {
      if (getToken()) {
        try {
          return await rpc<PublicEmployee[]>('api_employees');
        } catch {
          /* token no longer valid: fall through to the public list */
        }
      }
      return rpc<PublicEmployee[]>('public_employees', {}, false);
    },
    async restore() {
      if (!getToken()) return null;
      try {
        return await rpc<PublicEmployee>('api_me');
      } catch {
        setToken(null);
        return null;
      }
    },
    async login(id, pin) {
      try {
        const r = await rpc<{ ok: boolean; token?: string; employee?: PublicEmployee; reason?: string; retryAfterSeconds?: number }>(
          'api_login',
          { p_id: id, p_pin: pin },
          false,
        );
        if (r.ok && r.token && r.employee) {
          setToken(r.token);
          return { ok: true, employee: r.employee };
        }
        return { ok: false, reason: r.reason === 'locked' ? 'locked' : 'bad_pin', retryAfterSeconds: r.retryAfterSeconds };
      } catch {
        return { ok: false, reason: 'error' };
      }
    },
    async logout() {
      try {
        if (getToken()) await rpc<null>('api_logout');
      } catch {
        /* already invalid */
      }
      setToken(null);
    },
    setPin: (pin) => rpc<ActionResult>('api_set_pin', { p_pin: pin }),
    async skipPinChange() {
      await rpc<ActionResult>('api_skip_pin_change');
    },
    add: (name, role) => rpc<ActionResult>('api_add_employee', { p_name: name, p_role: role }),
    setRole: (id, role) => rpc<ActionResult>('api_set_role', { p_id: id, p_role: role }),
    resetPin: (id) => rpc<ActionResult>('api_reset_pin', { p_id: id }),
    remove: (id) => rpc<ActionResult>('api_remove_employee', { p_id: id }),
    setInventoryEditor: (id, value) => rpc<ActionResult>('api_set_inventory_editor', { p_id: id, p_value: value }),
    subscribe: poll,
  };
}

// ---------------------------------------------------------------- local: demo on one device

const SESSION_KEY = 'drix:session';
const COL = 'employees';

const publicOf = ({ id, name, role, mustChangePin, inventoryEditor, createdAt }: Employee): PublicEmployee => ({
  id,
  name,
  role,
  mustChangePin,
  inventoryEditor,
  createdAt,
});

function localApi(): EmployeeApi {
  const all = async (): Promise<Employee[]> =>
    seedIfEmpty<Employee>(COL, (await backend.list(COL)) as Employee[], seedEmployees);

  const sessionId = () => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  };
  const me = async () => (await all()).find((e) => e.id === sessionId());
  const managers = (list: Employee[]) => list.filter((e) => e.role === 'manager').length;

  return {
    async list() {
      return (await all()).map(publicOf);
    },
    async restore() {
      const e = await me();
      return e ? publicOf(e) : null;
    },
    async login(id, pin) {
      const e = (await all()).find((x) => x.id === id);
      if (!e || (await hashPin(e.id, pin)) !== e.pinHash) return { ok: false, reason: 'bad_pin' };
      try {
        localStorage.setItem(SESSION_KEY, e.id);
      } catch {
        /* private mode */
      }
      return { ok: true, employee: publicOf(e) };
    },
    async logout() {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    },
    async setPin(pin) {
      const e = await me();
      if (!e || !validPin(pin)) return { ok: false, reason: 'invalid_pin' };
      await backend.upsert(COL, { ...e, pinHash: await hashPin(e.id, pin), mustChangePin: false });
      return { ok: true };
    },
    async skipPinChange() {
      const e = await me();
      if (e) await backend.upsert(COL, { ...e, mustChangePin: false });
    },
    async add(name, role) {
      const list = await all();
      const clean = name.trim();
      if (!clean) return { ok: false, reason: 'invalid' };
      if (list.some((e) => e.name === clean)) return { ok: false, reason: 'duplicate_name' };
      const id = newId();
      const doc: Employee = {
        id,
        name: clean,
        role,
        pinHash: await hashPin(id, DEFAULT_PIN),
        mustChangePin: true,
        createdAt: new Date().toISOString(),
      };
      await backend.upsert(COL, doc);
      return { ok: true };
    },
    async setRole(id, role) {
      const list = await all();
      const e = list.find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'invalid' };
      if (role === 'staff' && e.role === 'manager' && managers(list) <= 1) return { ok: false, reason: 'last_manager' };
      await backend.upsert(COL, { ...e, role });
      return { ok: true };
    },
    async resetPin(id) {
      const e = (await all()).find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'invalid' };
      await backend.upsert(COL, { ...e, pinHash: await hashPin(e.id, DEFAULT_PIN), mustChangePin: true });
      return { ok: true };
    },
    async remove(id) {
      const list = await all();
      const e = list.find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'invalid' };
      if (id === sessionId()) return { ok: false, reason: 'self' };
      if (e.role === 'manager' && managers(list) <= 1) return { ok: false, reason: 'last_manager' };
      await backend.remove(COL, id);
      return { ok: true };
    },
    async setInventoryEditor(id, value) {
      const e = (await all()).find((x) => x.id === id);
      if (!e) return { ok: false, reason: 'invalid' };
      await backend.upsert(COL, { ...e, inventoryEditor: value });
      return { ok: true };
    },
    subscribe: (fn) => backend.subscribe(COL, fn),
  };
}

export const employeeApi: EmployeeApi = isShared ? sharedApi() : localApi();
