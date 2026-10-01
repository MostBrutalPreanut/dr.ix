// Drix OS - reads today's table reservations from Wix and hands the crew only what it needs.
//
// Supabase Edge Function "wix". Deploy with "Verify JWT" switched OFF (our sign-in is the
// gateway token, checked below). Secrets (Edge Functions -> Secrets):
//   WIX_API_KEY   the Wix API key (Manage Reservations permission, plus Read Reservation Locations
//                 so that table names can be shown). Never leaves the server.
//   WIX_SITE_ID   optional, defaults to the Drix site.
//
// Privacy: the response never contains phone, e-mail or last name - first name, time,
// party size, status and the notes only.

const WIX_API = Deno.env.get('WIX_API_BASE') ?? 'https://www.wixapis.com';
const SITE_ID = Deno.env.get('WIX_SITE_ID') ?? '3cba2a0c-6a93-489c-bdd5-700e5e07cba5';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const TZ = 'Asia/Jerusalem';
const BUSINESS_DAY_CUTOFF_HOUR = 5; // a 00:30 reservation still belongs to the evening before
const CACHE_MS = 30_000;
const MAX_PAGES = 5;
const SHOWN = ['RESERVED', 'REQUESTED', 'SEATED', 'FINISHED'];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'apikey, content-type, authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

// ---------- dates (Israel time) ----------

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localParts(d: Date): { date: string; hour: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), time: `${get('hour')}:${get('minute')}` };
}

function businessDayOf(d: Date): string {
  const { date, hour } = localParts(d);
  return hour < BUSINESS_DAY_CUTOFF_HOUR ? addDays(date, -1) : date;
}

// ---------- who is asking? ----------

async function whoIs(token: string, apikey: string): Promise<{ role: string } | null> {
  if (!token || !SUPABASE_URL) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/api_me`, {
    method: 'POST',
    headers: { apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  return r.ok ? ((await r.json()) as { role: string }) : null;
}

// ---------- Wix ----------

interface WixReservation {
  id?: string;
  status?: string;
  details?: { startDate?: string; partySize?: number; tableIds?: string[]; tables?: { ids?: string[] } };
  reservee?: { firstName?: string; customFields?: Record<string, unknown> };
  teamMessage?: string;
}

class WixError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Wix ${status}`);
  }
}

async function queryWix(apiKey: string, date: string): Promise<WixReservation[]> {
  // generous UTC window around the Israeli business day; exact filtering happens below
  const from = `${addDays(date, -1)}T21:00:00Z`;
  const to = `${addDays(date, 1)}T05:00:00Z`;
  const all: WixReservation[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = cursor
      ? { cursorPaging: { limit: 100, cursor } }
      : {
          // several conditions (and two operators on one field) must be combined with $and
          filter: {
            $and: [
              { 'details.startDate': { $gte: from } },
              { 'details.startDate': { $lte: to } },
              { status: { $in: SHOWN } },
            ],
          },
          sort: [{ fieldName: 'details.startDate', order: 'ASC' }],
          cursorPaging: { limit: 100 },
        };
    const res = await fetch(`${WIX_API}/table-reservations/reservations/v1/reservations/query`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'wix-site-id': SITE_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new WixError(res.status, (await res.text()).slice(0, 300));
    const body = (await res.json()) as {
      reservations?: WixReservation[];
      pagingMetadata?: { hasNext?: boolean; cursors?: { next?: string } };
    };
    all.push(...(body.reservations ?? []));
    cursor = body.pagingMetadata?.cursors?.next;
    if (!body.pagingMetadata?.hasNext || !cursor) break;
  }
  return all;
}

/** Table id -> the name set in the Wix dashboard ("7", "Window", ...). Wix keeps them on the reservation location. */
type TableNames = { names: Map<string, string>; status: 'ok' | 'permission' | 'error' };
let tableCache: { at: number; value: TableNames } | null = null;
const TABLE_CACHE_MS = 10 * 60_000;

async function fetchTableNames(apiKey: string): Promise<TableNames> {
  if (tableCache && Date.now() - tableCache.at < TABLE_CACHE_MS) return tableCache.value;
  let value: TableNames;
  try {
    const res = await fetch(`${WIX_API}/table-reservations/reservation-locations/v1/reservation-locations`, {
      headers: { Authorization: apiKey, 'wix-site-id': SITE_ID },
    });
    if (res.status === 401 || res.status === 403) value = { names: new Map(), status: 'permission' };
    else if (!res.ok) value = { names: new Map(), status: 'error' };
    else {
      const body = (await res.json()) as {
        reservationLocations?: { tableManagement?: { tableDefinitions?: TableDef[]; deletedTableDefinitions?: TableDef[] } }[];
      };
      const names = new Map<string, string>();
      for (const loc of body.reservationLocations ?? []) {
        for (const d of [...(loc.tableManagement?.deletedTableDefinitions ?? []), ...(loc.tableManagement?.tableDefinitions ?? [])]) {
          const id = d._id ?? d.id;
          if (id && typeof d.name === 'string' && d.name.trim()) names.set(id, d.name.trim());
        }
      }
      value = { names, status: 'ok' };
    }
  } catch {
    value = { names: new Map(), status: 'error' };
  }
  // do not remember a failure for long: the owner may be adding the permission right now
  tableCache = { at: value.status === 'ok' ? Date.now() : Date.now() - TABLE_CACHE_MS + 30_000, value };
  return value;
}

interface TableDef {
  _id?: string;
  id?: string;
  name?: string;
}

interface Reservation {
  id: string;
  time: string;
  start: string;
  partySize: number;
  firstName: string;
  status: string;
  /** What the guest wrote in the booking form (all filled-in custom fields). */
  notes: string[];
  /** What the staff wrote in "Team notes" in the Wix dashboard. */
  teamMessage: string;
  /** Wix table ids (names are not in the API; the app maps them to table numbers). */
  tableIds: string[];
  /** Table names from Wix, same order as tableIds ('' = Wix did not give a name). */
  tableNames: string[];
}

function normalise(list: WixReservation[], date: string, tables: Map<string, string>): Reservation[] {
  const out: Reservation[] = [];
  for (const r of list) {
    const start = r.details?.startDate;
    if (!start || !SHOWN.includes(r.status ?? '')) continue;
    const when = new Date(start);
    if (Number.isNaN(when.getTime()) || businessDayOf(when) !== date) continue;
    const notes = Object.values(r.reservee?.customFields ?? {})
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
    const tableIds = [...new Set([...(r.details?.tableIds ?? []), ...(r.details?.tables?.ids ?? [])])].filter((x) => typeof x === 'string');
    out.push({
      id: r.id ?? `${start}-${out.length}`,
      time: localParts(when).time,
      start,
      partySize: r.details?.partySize ?? 0,
      firstName: (r.reservee?.firstName ?? '').trim(),
      status: r.status ?? '',
      notes,
      teamMessage: (r.teamMessage ?? '').trim(),
      tableIds,
      tableNames: tableIds.map((id) => tables.get(id) ?? ''),
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** For managers only: what the form fields look like, so we can see where notes come from. */
function debugInfo(raw: WixReservation[]) {
  const statuses: Record<string, number> = {};
  const customFields: Record<string, string[]> = {};
  let withTeamMessage = 0;
  for (const r of raw) {
    statuses[r.status ?? '?'] = (statuses[r.status ?? '?'] ?? 0) + 1;
    if (r.teamMessage?.trim()) withTeamMessage++;
    for (const [k, v] of Object.entries(r.reservee?.customFields ?? {})) {
      const samples = (customFields[k] ??= []);
      if (samples.length < 3) samples.push(typeof v === 'string' ? v.slice(0, 80) : `(${typeof v})`);
    }
  }
  return { reservationsFromWix: raw.length, statuses, withTeamMessage, customFields };
}

// ---------- handler ----------

const cache = new Map<string, { at: number; raw: WixReservation[] }>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let role = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; date?: string; debug?: boolean };
    const me = await whoIs(body.token ?? '', req.headers.get('apikey') ?? '');
    if (!me) return json({ error: 'unauthorized' }, 401);
    role = me.role;

    const date = body.date ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad_date' }, 400);

    const apiKey = Deno.env.get('WIX_API_KEY');
    if (!apiKey) return json({ configured: false });

    let hit = cache.get(date);
    if (!hit || Date.now() - hit.at > CACHE_MS) {
      hit = { at: Date.now(), raw: await queryWix(apiKey, date) };
      cache.set(date, hit);
      if (cache.size > 20) cache.delete(cache.keys().next().value as string);
    }

    const tables = await fetchTableNames(apiKey);
    return json({
      configured: true,
      date,
      fetchedAt: new Date(hit.at).toISOString(),
      tableNamesStatus: tables.status,
      reservations: normalise(hit.raw, date, tables.names),
      ...(body.debug && me.role === 'manager' ? { debug: debugInfo(hit.raw) } : {}),
    });
  } catch (e) {
    if (e instanceof WixError) {
      return json({ configured: true, error: e.status === 401 || e.status === 403 ? 'wix_auth' : 'wix_error', status: e.status, ...(role === 'manager' ? { detail: e.detail } : {}) }, 502);
    }
    console.error(e);
    return json({ error: 'internal' }, 500);
  }
});
