/** Sign-in token of the shared (Supabase) mode, kept in this browser only. */
const KEY = 'drix:token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session just will not survive a reload */
  }
}

let onUnauthorized: (() => void) | null = null;

/** The server said our token is no longer valid (expired, or the PIN was reset). */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export function notifyUnauthorized(): void {
  setToken(null);
  onUnauthorized?.();
}
