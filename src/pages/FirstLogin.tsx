import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { PinPad } from './Login';
import { t } from '../lib/i18n';

/** Asks for a personal PIN on the first login (can be skipped). */
export default function FirstLogin() {
  const { user, changePin, skipPinChange } = useAuth();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submit(pin: string) {
    if (pin === '0000') {
      setError(t('בחרו קוד אחר מ-0000'));
      return;
    }
    if (first === null) {
      setFirst(pin);
      setError('');
    } else if (first === pin) {
      if (!(await changePin(pin))) {
        setFirst(null);
        setError(t('הקוד לא התקבל, נסו קוד אחר'));
      }
    } else {
      setFirst(null);
      setError(t('הקודים לא תאמו, נסו שוב מההתחלה'));
    }
  }

  return (
    <div className="login">
      <h1>{t('היי')}{' '}{user?.name} 👋</h1>
      <p className="muted">
        {first === null ? t('בחרו קוד אישי בן 4 ספרות') : t('הזינו שוב לאישור')}
      </p>
      <PinPad onSubmit={(p) => void submit(p)} />
      <p className="error" role="alert">{error}</p>
      <button type="button" className="link" onClick={() => void skipPinChange()}>
        {t('אולי אחר כך (הקוד נשאר 0000)')}
      </button>
    </div>
  );
}
