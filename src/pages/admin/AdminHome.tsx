import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { t, tn } from '../../lib/i18n';

const ITEMS = [
  ['/admin/schedule', '🗓️', tn('סידור עבודה'), tn('שיבוץ עובדים, אירועים מיוחדים ופרסום לצוות')],
  ['/admin/notes', '📣', tn('הערות למשמרת'), tn('כתיבת הוראות לצוות של היום או של מחר')],
  ['/admin/employees', '👥', tn('עובדים'), tn('הוספה, מחיקה, הרשאות ואיפוס קוד')],
  ['/admin/checklists', '✅', tn('נהלי פתיחה וסגירה'), tn("עריכת הסעיפים בצ'קליסטים")],
  ['/admin/tasks', '🧹', tn('משימות ניקיון'), tn('ימים, תדירות והסברים לעובדים')],
  ['/admin/inventory', '📦', tn('מלאי'), tn('פריטים, קטגוריות, ימי בדיקה וסדר ברשימה')],
  ['/admin/wix', '🔌', tn('חיבור Wix'), tn('בדיקה שההזמנות נטענות והערות הלקוחות מופיעות')],
] as const;

export default function AdminHome() {
  const { isManager } = useAuth();
  const items = isManager ? ITEMS : ITEMS.filter(([to]) => to === '/admin/inventory');
  return (
    <>
      <h1>{t('⚙️ ניהול')}</h1>
      <div className="stack">
        {items.map(([to, ico, title, desc]) => (
          <Link key={to} to={to} className="card tile row-tile">
            <span className="big-ico">{ico}</span>
            <span>
              <strong>{t(title)}</strong>
              <span className="muted small-text block">{t(desc)}</span>
            </span>
          </Link>
        ))}
        {isManager && (
        <p className="muted small-text">
          {t('עריכת נהלים ומשחקים נעשית ישירות מהלשוניות "נהלים" ו"משחקים" (כפתור העריכה מופיע רק למנהלים).')}
        </p>
        )}
      </div>
    </>
  );
}
