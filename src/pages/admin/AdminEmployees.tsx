import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { DEFAULT_PIN } from '../../lib/pin';
import type { ActionResult } from '../../lib/employeesApi';
import type { Role } from '../../lib/types';

const REASON: Record<string, string> = {
  duplicate_name: 'כבר יש עובד בשם הזה',
  last_manager: 'חייב להישאר לפחות מנהל אחד',
  self: 'אי אפשר למחוק את עצמך',
  invalid: 'הפרטים לא תקינים',
};

export default function AdminEmployees() {
  const { employees, user, addEmployee, setRole: changeRole, resetPin, removeEmployee } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [msg, setMsg] = useState('');

  const managers = employees.filter((e) => e.role === 'manager');

  /** Runs an admin action and shows the server's answer. */
  async function run(action: Promise<ActionResult>, success = ''): Promise<boolean> {
    try {
      const r = await action;
      setMsg(r.ok ? success : (REASON[r.reason] ?? 'הפעולה נכשלה'));
      return r.ok;
    } catch {
      setMsg('אין חיבור לשרת או שאין הרשאה');
      return false;
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await run(addEmployee(trimmed, role), `${trimmed} נוסף/ה. הקוד ההתחלתי: ${DEFAULT_PIN}`)) setName('');
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
      </form>
      {msg && <p className="muted" role="status">{msg}</p>}

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
                    onClick={() => void run(changeRole(e.id, e.role === 'manager' ? 'staff' : 'manager'))}
                  >
                    {e.role === 'manager' ? 'הפוך לעובד' : 'הפוך למנהל'}
                  </button>
                  <button
                    type="button"
                    className="small"
                    onClick={() => {
                      if (confirm(`לאפס את הקוד של ${e.name} ל-${DEFAULT_PIN}?`))
                        void run(resetPin(e.id), `הקוד של ${e.name} אופס ל-${DEFAULT_PIN}`);
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
                      if (confirm(`למחוק את ${e.name}? הפעולה לא ניתנת לביטול.`)) void run(removeEmployee(e.id));
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
