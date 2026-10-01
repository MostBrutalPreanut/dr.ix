import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Doc } from './types';

/**
 * Tiny document store. Every collection is a list of `{ id, ...fields }` documents.
 *
 *  - Without configuration the data lives in this browser's localStorage (demo / single device).
 *  - With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY it is shared between all devices in real time.
 *    See supabase/schema.sql.
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
  upsert(collection: string, doc: Doc): Promise<void>;
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

// ---------- supabase ----------

function supabaseBackend(url: string, anonKey: string): Backend {
  const client = createClient(url, anonKey);
  const table = 'docs';
  return {
    async list(c, range) {
      let q = client.from(table).select('id, data').eq('collection', c);
      if (range) q = q.gte('id', range.from).lte('id', range.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...(r.data as object), id: r.id as string }));
    },
    async upsert(c, doc) {
      const { error } = await client
        .from(table)
        .upsert({ collection: c, id: doc.id, data: doc, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async remove(c, id) {
      const { error } = await client.from(table).delete().eq('collection', c).eq('id', id);
      if (error) throw error;
    },
    subscribe(c, fn) {
      const channel = client
        .channel(`docs:${c}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `collection=eq.${c}` },
          fn,
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isShared = Boolean(url && anonKey);
export const backend: Backend = isShared ? supabaseBackend(url!, anonKey!) : localBackend();

// ---------- React hook ----------

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const seedStarted = new Set<string>();

type Seed<T> = () => T[] | Promise<T[]>;

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
      if (rows.length === 0 && seedRef.current && !seedStarted.has(name)) {
        seedStarted.add(name);
        const markerId = `seeded_${name}`;
        const marker = (await backend.list('meta')).find((d) => d.id === markerId);
        if (!marker) {
          const docs = await seedRef.current();
          await Promise.all(docs.map((d) => backend.upsert(name, d)));
          await backend.upsert('meta', { id: markerId });
          rows = docs;
        }
      }
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
