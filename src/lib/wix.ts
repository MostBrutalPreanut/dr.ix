import { useCallback, useEffect, useState } from 'react';
import { isShared, poll, supabaseKey, supabaseUrl } from './gateway';
import { getToken, notifyUnauthorized } from './session';

export interface Reservation {
  id: string;
  time: string; // HH:MM, Israel time
  start: string;
  partySize: number;
  firstName: string;
  status: string;
  /** What the guest wrote in the booking form. */
  notes: string[];
  /** What the staff wrote under "Team notes" in Wix. */
  teamMessage: string;
  /** Wix table ids (see the table-number mapping in the Wix admin screen). */
  tableIds: string[];
}

export interface WixDebug {
  reservationsFromWix: number;
  statuses: Record<string, number>;
  withTeamMessage: number;
  customFields: Record<string, string[]>;
}

export type WixState =
  | { state: 'off' } // local demo mode: no server
  | { state: 'loading' }
  | { state: 'not_configured' }
  | { state: 'error'; reason: 'wix_auth' | 'wix_error' | 'unreachable'; detail?: string }
  | { state: 'ok'; reservations: Reservation[]; fetchedAt: string; debug?: WixDebug };

/** Asks the "wix" server function for the reservations of a business day. */
export async function fetchReservations(date: string, debug = false): Promise<WixState> {
  if (!isShared || !supabaseUrl || !supabaseKey) return { state: 'off' };
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/wix`, {
      method: 'POST',
      // The function is called with the public key only; our own sign-in token goes in the body.
      headers: { apikey: supabaseKey, 'content-type': 'application/json' },
      body: JSON.stringify({ token: getToken(), date, debug }),
    });
    if (res.status === 401) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === 'unauthorized') notifyUnauthorized();
      return { state: 'error', reason: 'unreachable' };
    }
    if (res.status === 404) return { state: 'not_configured' }; // function not deployed yet
    const body = (await res.json()) as {
      configured?: boolean;
      error?: string;
      detail?: string;
      reservations?: Reservation[];
      fetchedAt?: string;
      debug?: WixDebug;
    };
    if (body.configured === false) return { state: 'not_configured' };
    if (body.error === 'wix_auth' || body.error === 'wix_error') {
      return { state: 'error', reason: body.error, detail: body.detail };
    }
    if (!res.ok || !body.reservations) return { state: 'error', reason: 'unreachable' };
    return { state: 'ok', reservations: body.reservations, fetchedAt: body.fetchedAt ?? '', debug: body.debug };
  } catch {
    return { state: 'error', reason: 'unreachable' };
  }
}

export type FunctionDiagnosis = 'missing' | 'jwt_on' | 'reachable' | 'network';

/**
 * Works out why the function cannot be reached. A plain GET (no custom headers) needs no CORS
 * preflight, so even the gateway's error answers stay readable from the browser.
 *   404 -> there is no function called "wix"
 *   401 -> it exists but "Verify JWT" is still on
 *   405 -> it exists and answers (our function only accepts POST)
 */
export async function diagnoseFunction(): Promise<FunctionDiagnosis> {
  if (!supabaseUrl) return 'network';
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/wix`);
    if (res.status === 404) return 'missing';
    if (res.status === 401 || res.status === 403) return 'jwt_on';
    return 'reachable';
  } catch {
    return 'network';
  }
}

const lastAnswer = new Map<string, WixState>();

/** Forget the last answers (called at sign-out). */
export function clearWixCache(): void {
  lastAnswer.clear();
}

/** Today's reservations, refreshed every minute and when the app comes back to the foreground. */
export function useReservations(date: string): WixState {
  const [state, setState] = useState<WixState>(() => lastAnswer.get(date) ?? (isShared ? { state: 'loading' } : { state: 'off' }));

  const load = useCallback(async () => {
    const next = await fetchReservations(date);
    // a hiccup must not wipe a list that is already on screen
    setState((prev) => {
      const shown = next.state === 'error' && prev.state === 'ok' ? prev : next;
      lastAnswer.set(date, shown);
      return shown;
    });
  }, [date]);

  useEffect(() => {
    if (!isShared) return;
    setState((prev) => (prev.state === 'ok' ? prev : lastAnswer.get(date) ?? { state: 'loading' }));
    void load();
    return poll(() => void load(), 60_000);
  }, [date, load]);

  return state;
}
