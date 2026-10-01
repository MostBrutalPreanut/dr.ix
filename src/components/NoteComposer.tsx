import { useState } from 'react';
import { newId, useCollection } from '../lib/db';
import { useAuth } from '../lib/auth';
import { AREA_LABEL } from '../lib/types';
import type { Area, Note } from '../lib/types';

/** Manager form: write a note for the crew of a given business day. */
export function NoteComposer({ date, onDone }: { date: string; onDone?: () => void }) {
  const { user } = useAuth();
  const { save } = useCollection<Note>('notes', undefined, { from: date, to: `${date}~` });
  const [text, setText] = useState('');
  const [area, setArea] = useState<Area>('all');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setBusy(true);
    try {
      await save({
        id: `${date}|${newId()}`,
        date,
        text: text.trim(),
        area,
        urgent,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      });
      setText('');
      setUrgent(false);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form composer" onSubmit={(e) => void submit(e)}>
      <label>
        הערה למשמרת
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="למשל: לחבר שולחנות 4 ו-5 לשעה 19:00, לסדר את החדר הפרטי, להכין תוספות פיצה אקסטרה…"
        />
      </label>
      <div className="field-row">
        <label className="inline">
          למי?
          <select value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {(Object.keys(AREA_LABEL) as Area[]).map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`chip pick${urgent ? ' on' : ''}`}
          aria-pressed={urgent}
          onClick={() => setUrgent((u) => !u)}
        >
          🚨 דחוף
        </button>
      </div>
      <button type="submit" className="primary" disabled={busy || !text.trim()}>
        פרסם
      </button>
    </form>
  );
}
