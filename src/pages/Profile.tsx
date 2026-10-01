import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { isShared } from '../lib/db';
import { PinPad } from './Login';
import { t } from '../lib/i18n';

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
      if (await changePin(pin)) setMode('done');
      else {
        setError(t('הקוד לא התקבל. חייבות להיות 4 ספרות, ולא 0000'));
        setMode('first');
      }
    } else {
      setError(t('הקודים לא תאמו, נסו שוב'));
      setMode('first');
    }
  }

  return (
    <>
      <h1>
        {user?.name} <span className="chip">{user?.role === 'manager' ? t('מנהל') : t('עובד')}</span>
      </h1>

      <section className="card">
        <h2>{t('הקוד האישי')}</h2>
        {mode === 'idle' || mode === 'done' ? (
          <>
            {mode === 'done' && <p className="ok">{t('✓ הקוד עודכן')}</p>}
            <button type="button" onClick={() => setMode('first')}>
              {t('שינוי קוד')}
            </button>
          </>
        ) : (
          <>
            <p className="muted">{mode === 'first' ? t('הזינו קוד חדש בן 4 ספרות') : t('הזינו שוב לאישור')}</p>
            <PinPad onSubmit={(p) => void submit(p)} />
            <p className="error" role="alert">{error}</p>
            <button type="button" className="link" onClick={() => setMode('idle')}>
              {t('ביטול')}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>{t('מצב האפליקציה')}</h2>
        <p>
          {isShared
            ? t('🟢 מחובר לשרת. כל המכשירים רואים אותם נתונים בזמן אמת.')
            : t('🟡 מצב מקומי: הנתונים נשמרים רק בדפדפן הזה.')}
        </p>
      </section>

      <p className="muted small-text center">{t('גרסה')}{' '}{__BUILD__}</p>
      <button type="button" className="danger wide" onClick={logout}>
        {t('התנתקות')}
      </button>
    </>
  );
}
