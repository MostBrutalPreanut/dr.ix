import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from './types';
import { isShared, poll, rpc } from './gateway';

export { isShared };

/**
 * Tiny document store. Every collection is a list of `{ id, ...fields }` documents.
 *
 *  - Without configuration the data lives in this browser's localStorage (demo / single device).
 *  - With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY it is shared between all devices through the
 *    secure gateway (supabase/gateway.sql): every call is checked on the server.
 */
/** Inclusive id range (ids are compared as strings, so date-prefixed ids sort chronologically). */
export interface IdRange {
  from: string;
  to: string;
}

/** All ids that start with `prefix`. */
export const idPrefix = (prefix: string): IdRange => ({ from: prefix, to: `${prefix}~` });

interface Backend {
  list(collection: string, range?: IdRange): Promise<Doc[]>;
  upsert<T extends Doc>(collection: string, doc: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  subscribe(collection: string, onChange: () => void): () => void;
}

// ---------- local ----------

function localBackend(): Backend {
  const listeners = new Map<string, Set<() => void>>();
  const key = (c: string) => `drix:${c}`;
  const read = (c: string): Doc[] => {
    try {
      return JSON.parse(localStorage.getItem(key(c)) ?? '[]') as Doc[];
    } catch {
      return [];
    }
  };
  const write = (c: string, docs: Doc[]) => {
    localStorage.setItem(key(c), JSON.stringify(docs));
    listeners.get(c)?.forEach((fn) => fn());
  };

  // Other tabs / windows of the same browser
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('drix:')) listeners.get(e.key.slice(5))?.forEach((fn) => fn());
  });

  return {
    async list(c, range) {
      const docs = read(c);
      return range ? docs.filter((d) => d.id >= range.from && d.id <= range.to) : docs;
    },
    async upsert(c, doc) {
      const docs = read(c);
      const i = docs.findIndex((d) => d.id === doc.id);
      if (i >= 0) docs[i] = doc;
      else docs.push(doc);
      write(c, docs);
    },
    async remove(c, id) {
      write(c, read(c).filter((d) => d.id !== id));
    },
    subscribe(c, fn) {
      if (!listeners.has(c)) listeners.set(c, new Set());
      listeners.get(c)!.add(fn);
      return () => listeners.get(c)?.delete(fn);
    },
  };
}

// ---------- shared (supabase gateway) ----------

function sharedBackend(): Backend {
  return {
    async list(c, range) {
      return rpc<Doc[]>('api_list', { p_collection: c, p_from: range?.from ?? null, p_to: range?.to ?? null });
    },
    async upsert(c, doc) {
      await rpc<null>('api_upsert', { p_collection: c, p_doc: doc });
    },
    async remove(c, id) {
      await rpc<null>('api_remove', { p_collection: c, p_id: id });
    },
    subscribe(_c, fn) {
      return poll(fn);
    },
  };
}

export const backend: Backend = isShared ? sharedBackend() : localBackend();

// ---------- React hook ----------

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const seeding = new Map<string, Promise<Doc[]>>();

type Seed<T> = () => T[] | Promise<T[]>;

/** Only managers may write starting content to the shared server (set at sign-in). */
let seedAllowed = !isShared;
export function setSeedAllowed(allowed: boolean): void {
  seedAllowed = allowed;
}

/**
 * If a collection has never been used, writes its starting content once (a marker stops it
 * from coming back after someone deletes everything). Returns the rows to show. Callers that
 * arrive while the seeding is running wait for it instead of showing an empty list.
 */
export async function seedIfEmpty<T extends Doc>(name: string, rows: T[], seed: Seed<T>): Promise<T[]> {
  if (rows.length > 0 || !seedAllowed) return rows;
  let job = seeding.get(name);
  if (!job) {
    job = (async (): Promise<Doc[]> => {
      const markerId = `seeded_${name}`;
      const marker = (await backend.list('meta')).find((d) => d.id === markerId);
      if (marker) return [];
      const docs = await seed();
      await Promise.all(docs.map((d) => backend.upsert(name, d)));
      await backend.upsert('meta', { id: markerId });
      return docs;
    })();
    seeding.set(name, job);
    job.catch(() => seeding.delete(name)); // allow a retry after a failure
  }
  const docs = (await job) as T[];
  return docs.length > 0 ? docs : rows;
}

/**
 * Live list of documents. When the collection has never been used, `seed` provides the
 * starting content (written once - a marker stops it from coming back after deletions).
 */
export function useCollection<T extends Doc>(name: string, seed?: Seed<T>, range?: IdRange) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const from = range?.from;
  const to = range?.to;

  const load = useCallback(async () => {
    try {
      let rows = (await backend.list(name, from !== undefined && to !== undefined ? { from, to } : undefined)) as T[];
      if (seedRef.current) rows = await seedIfEmpty(name, rows, seedRef.current);
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [name, from, to]);

  useEffect(() => {
    void load();
    return backend.subscribe(name, () => void load());
  }, [name, load]);

  const save = useCallback(
    async (doc: T) => {
      await backend.upsert(name, doc);
      await load();
    },
    [name, load],
  );

  const remove = useCallback(
    async (id: string) => {
      await backend.remove(name, id);
      await load();
    },
    [name, load],
  );

  return { items, loading, error, save, remove };
}
