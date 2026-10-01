import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getToken, notifyUnauthorized } from './session';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app talks to the shared server; false = single-device demo mode. */
export const isShared = Boolean(url && anonKey);

const client: SupabaseClient | null = isShared
  ? createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null;

/**
 * Calls a function of the secure gateway (supabase/gateway.sql). The database tables are not
 * reachable directly - the server checks the sign-in token and the role on every call.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, signedIn = true): Promise<T> {
  if (!client) throw new Error('shared mode is not configured');
  const { data, error } = await client.rpc(fn, signedIn ? { p_token: getToken(), ...args } : args);
  if (error) {
    if (/unauthorized/i.test(error.message)) notifyUnauthorized();
    throw new Error(error.message);
  }
  return data as T;
}

/** Refresh interval for shared data. Also refreshes right away when the app comes back to the foreground. */
const POLL_MS = 10_000;

export function poll(fn: () => void): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') fn();
  };
  const timer = setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', tick);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
  };
}
