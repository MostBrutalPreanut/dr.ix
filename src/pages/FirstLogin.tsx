import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { PinPad } from './Login';

/** Asks for a personal PIN on the first login (can be skipped). */
export default function FirstLogin() {
  const { user, changePin, skipPinChange } = useAuth();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submit(pin: string) {
    if (pin === '0000') {
      setError('בחרו קוד אחר מ-0000');
      return;
    }
    if (first === null) {
      setFirst(pin);
      setError('');
    } else if (first === pin) {
      if (!(await changePin(pin))) {
        setFirst(null);
        setError('הקוד לא התקבל, נסו קוד אחר');
      }
    } else {
      setFirst(null);
      setError('הקודים לא תאמו, נסו שוב מההתחלה');
    }
  }

  return (
    <div className="login">
      <h1>היי {user?.name} 👋</h1>
      <p className="muted">
        {first === null ? 'בחרו קוד אישי בן 4 ספרות' : 'הזינו שוב לאישור'}
      </p>
      <PinPad onSubmit={(p) => void submit(p)} />
      <p className="error" role="alert">{error}</p>
      <button type="button" className="link" onClick={() => void skipPinChange()}>
        אולי אחר כך (הקוד נשאר 0000)
      </button>
    </div>
  );
}
