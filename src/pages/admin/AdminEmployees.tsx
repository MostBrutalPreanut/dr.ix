import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, } from '../../lib/auth';
import { newId } from '../../lib/db';
import { DEFAULT_PIN, hashPin } from '../../lib/pin';
import type { Role } from '../../lib/types';

export default function AdminEmployees() {
  const { employees, user, saveEmployee, removeEmployee } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [msg, setMsg] = useState('');

  const managers = employees.filter((e) => e.role === 'manager');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (employees.some((x) => x.name === trimmed)) {
      setMsg('כבר יש עובד בשם הזה');
      return;
    }
    const id = newId();
    await saveEmployee({
      id,
      name: trimmed,
      role,
      pinHash: await hashPin(id, DEFAULT_PIN),
      mustChangePin: true,
      createdAt: new Date().toISOString(),
    });
    setName('');
    setMsg(`${trimmed} נוסף/ה. הקוד ההתחלתי: ${DEFAULT_PIN}`);
  }

  return (
    <>
      <Link to="/admin" className="back">← ניהול</Link>
      <h1>👥 עובדים ({employees.length})</h1>

      <form className="card form" onSubmit={(e) => void add(e)}>
        <div className="row">
          <label style={{ flex: 1 }}>
            שם
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם העובד/ת" />
          </label>
          <label>
            תפקיד
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="staff">עובד</option>
              <option value="manager">מנהל</option>
            </select>
          </label>
        </div>
        <button type="submit" className="primary" disabled={!name.trim()}>
          + הוסף עובד
        </button>
        {msg && <p className="muted small-text">{msg}</p>}
      </form>

      <div className="card list">
        {[...employees]
          .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'he') : a.role === 'manager' ? -1 : 1))
          .map((e) => {
            const isMe = e.id === user?.id;
            const lastManager = e.role === 'manager' && managers.length <= 1;
            return (
              <div key={e.id} className="li emp">
                <span className="avatar">{e.name.slice(0, 1)}</span>
                <span className="li-body">
                  <strong>{e.name}</strong> {isMe && <span className="muted small-text">(אני)</span>}
                  <span className="muted small-text block">
                    {e.role === 'manager' ? 'מנהל' : 'עובד'}
                    {e.mustChangePin && ' · עוד לא בחר/ה קוד אישי'}
                  </span>
                </span>
                <span className="row actions">
                  <button
                    type="button"
                    className="small"
                    disabled={lastManager}
                    title={lastManager ? 'חייב להישאר לפחות מנהל אחד' : ''}
                    onClick={() => void saveEmployee({ ...e, role: e.role === 'manager' ? 'staff' : 'manager' })}
                  >
                    {e.role === 'manager' ? 'הפוך לעובד' : 'הפוך למנהל'}
                  </button>
                  <button
                    type="button"
                    className="small"
                    onClick={async () => {
                      if (confirm(`לאפס את הקוד של ${e.name} ל-${DEFAULT_PIN}?`))
                        await saveEmployee({ ...e, pinHash: await hashPin(e.id, DEFAULT_PIN), mustChangePin: true });
                    }}
                  >
                    אפס קוד
                  </button>
                  <button
                    type="button"
                    className="small danger"
                    disabled={isMe || lastManager}
                    title={isMe ? 'אי אפשר למחוק את עצמך' : ''}
                    onClick={() => {
                      if (confirm(`למחוק את ${e.name}? הפעולה לא ניתנת לביטול.`)) void removeEmployee(e.id);
                    }}
                  >
                    מחק
                  </button>
                </span>
              </div>
            );
          })}
      </div>
    </>
  );
}
