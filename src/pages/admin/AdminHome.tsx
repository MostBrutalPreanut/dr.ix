import { Link } from 'react-router-dom';

const ITEMS = [
  ['/admin/notes', '📣', 'הערות למשמרת', 'כתיבת הוראות לצוות של היום או של מחר'],
  ['/admin/employees', '👥', 'עובדים', 'הוספה, מחיקה, הרשאות ואיפוס קוד'],
  ['/admin/checklists', '✅', 'נהלי פתיחה וסגירה', 'עריכת הסעיפים בצ\'קליסטים'],
  ['/admin/tasks', '🧹', 'משימות ניקיון', 'ימים, תדירות והסברים לעובדים'],
] as const;

export default function AdminHome() {
  return (
    <>
      <h1>⚙️ ניהול</h1>
      <div className="stack">
        {ITEMS.map(([to, ico, title, desc]) => (
          <Link key={to} to={to} className="card tile row-tile">
            <span className="big-ico">{ico}</span>
            <span>
              <strong>{title}</strong>
              <span className="muted small-text block">{desc}</span>
            </span>
          </Link>
        ))}
        <p className="muted small-text">
          עריכת נהלים ומשחקים נעשית ישירות מהלשוניות "נהלים" ו"משחקים" (כפתור העריכה מופיע רק למנהלים).
        </p>
      </div>
    </>
  );
}
