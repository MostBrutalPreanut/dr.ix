import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { idPrefix, useCollection } from '../../lib/db';
import { addDays, formatLongDate, formatTime } from '../../lib/dates';
import { useBusinessDate } from '../../lib/useBusinessDate';
import { AREA_LABEL } from '../../lib/types';
import type { Note, NoteAck } from '../../lib/types';
import { NoteComposer } from '../../components/NoteComposer';
import { t } from '../../lib/i18n';

export default function AdminNotes() {
  const today = useBusinessDate();
  const [date, setDate] = useState(today);
  const { employees } = useAuth();
  const notes = useCollection<Note>('notes', undefined, idPrefix(date));
  const acks = useCollection<NoteAck>('noteAcks', undefined, idPrefix(date));
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '?';

  return (
    <>
      <Link to="/admin" className="back">{t('← ניהול')}</Link>
      <h1>{t('📣 הערות למשמרת')}</h1>
      <div className="row between datebar">
        <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label={t('היום הקודם')}>→</button>
        <div className="center">
          <strong>{formatLongDate(date)}</strong>
          {date === today && <span className="chip">{t('היום')}</span>}
          {date === addDays(today, 1) && <span className="chip">{t('מחר')}</span>}
        </div>
        <button type="button" onClick={() => setDate(addDays(date, 1))} aria-label={t('היום הבא')}>←</button>
      </div>
      <div className="row">
        <button type="button" className="small" onClick={() => setDate(today)}>{t('היום')}</button>
        <button type="button" className="small" onClick={() => setDate(addDays(today, 1))}>{t('מחר')}</button>
      </div>

      <NoteComposer date={date} />

      {notes.items.length === 0 && <p className="muted empty">{t('אין הערות לתאריך הזה.')}</p>}
      {[...notes.items]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((n) => {
          const seen = acks.items.filter((a) => a.noteId === n.id);
          return (
            <article key={n.id} className={`card note${n.urgent ? ' urgent' : ''}`}>
              <div className="note-meta">
                {n.urgent && <span className="chip red">{t('דחוף')}</span>}
                <span className="chip">{t(AREA_LABEL[n.area])}</span>
                <span className="muted small-text">
                  {nameOf(n.createdBy)} · {formatTime(n.createdAt)}
                </span>
              </div>
              <p className="note-text">{n.text}</p>
              <div className="note-foot">
                <span className="muted small-text">
                  {t('ראו (')}{seen.length}): {seen.map((a) => nameOf(a.employeeId)).join(', ') || t('אף אחד עדיין')}
                </span>
                <button
                  type="button"
                  className="danger small"
                  onClick={() => {
                    if (confirm(t('למחוק את ההערה?'))) {
                      void notes.remove(n.id);
                      seen.forEach((a) => void acks.remove(a.id));
                    }
                  }}
                >
                  {t('מחק')}
                </button>
              </div>
            </article>
          );
        })}
    </>
  );
}
