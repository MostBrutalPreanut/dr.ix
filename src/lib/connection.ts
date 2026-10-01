import { useSyncExternalStore } from 'react';

/** Did the last attempt to load data from the server work? Shown as a banner in the app. */
interface ConnectionState {
  ok: boolean;
  message: string;
}

let state: ConnectionState = { ok: true, message: '' };
const listeners = new Set<() => void>();

function set(next: ConnectionState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

export function reportOk(): void {
  if (!state.ok) set({ ok: true, message: '' });
}

export function reportFail(message: string): void {
  if (state.ok || state.message !== message) set({ ok: false, message });
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
