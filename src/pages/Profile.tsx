import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { isShared } from '../lib/db';
import { PinPad } from './Login';

export default function Profile() {
  const { user, logout, changePin } = useAuth();
  const [mode, setMode] = useState<'idle' | 'first' | 'second' | 'done'>('idle');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');

  async function submit(pin: string) {
    if (mode === 'first') {
      setFirst(pin);
      setError('');
      setMode('second');
    } else if (pin === first) {
      await changePin(pin);
      setMode('done');
    } else {
      setError('הקודים לא תאמו, נסו שוב');
      setMode('first');
    }
  }

  return (
    <>
      <h1>
        {user?.name} <span className="chip">{user?.role === 'manager' ? 'מנהל' : 'עובד'}</span>
      </h1>

      <section className="card">
        <h2>הקוד האישי</h2>
        {mode === 'idle' || mode === 'done' ? (
          <>
            {mode === 'done' && <p className="ok">✓ הקוד עודכן</p>}
            <button type="button" onClick={() => setMode('first')}>
              שינוי קוד
            </button>
          </>
        ) : (
          <>
            <p className="muted">{mode === 'first' ? 'הזינו קוד חדש בן 4 ספרות' : 'הזינו שוב לאישור'}</p>
            <PinPad onSubmit={(p) => void submit(p)} />
            <p className="error" role="alert">{error}</p>
            <button type="button" className="link" onClick={() => setMode('idle')}>
              ביטול
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>מצב האפליקציה</h2>
        <p>
          {isShared
            ? '🟢 מחובר לשרת. כל המכשירים רואים אותם נתונים בזמן אמת.'
            : '🟡 מצב מקומי: הנתונים נשמרים רק בדפדפן הזה.'}
        </p>
      </section>

      <button type="button" className="danger wide" onClick={logout}>
        התנתקות
      </button>
    </>
  );
}
