import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Layout';

export function PinPad({ onSubmit, disabled }: { onSubmit(pin: string): void; disabled?: boolean }) {
  const [pin, setPin] = useState('');
  const press = (d: string) => {
    if (disabled) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setPin('');
      onSubmit(next);
    }
  };
  return (
    <div className="pinpad">
      <div className="dots" aria-label={`הוזנו ${pin.length} ספרות`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="ghost" onClick={() => setPin('')} aria-label="נקה">
          ✕
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="ghost" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="מחק ספרה">
          ⌫
        </button>
      </div>
    </div>
  );
}

export default function Login() {
  const { employees, ready, login } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const person = employees.find((e) => e.id === selected);

  const sorted = [...employees].sort(
    (a, b) => (a.role === b.role ? 0 : a.role === 'manager' ? -1 : 1) || a.name.localeCompare(b.name, 'he'),
  );

  async function submit(pin: string) {
    if (!selected) return;
    const ok = await login(selected, pin);
    if (!ok) setError('הקוד שגוי, נסו שוב');
  }

  return (
    <div className="login">
      <Logo size={96} className="logo-big" />
      <h1>דריקס OS</h1>
      {!ready ? (
        <p className="muted">טוען…</p>
      ) : !person ? (
        <>
          <p className="muted">מי עובד היום?</p>
          <div className="people">
            {sorted.map((e) => (
              <button key={e.id} type="button" onClick={() => { setSelected(e.id); setError(''); }}>
                <span className="avatar">{e.name.slice(0, 1)}</span>
                {e.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="who">שלום {person.name}, הזינו קוד</p>
          <PinPad onSubmit={submit} />
          <p className="error" role="alert">{error}</p>
          <button type="button" className="link" onClick={() => setSelected(null)}>
            ← לא אני
          </button>
        </>
      )}
    </div>
  );
}
