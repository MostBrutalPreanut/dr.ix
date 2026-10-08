import { useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isShared } from '../lib/db';
import logoUrl from '../assets/logo.png';
import { useConnection } from '../lib/connection';
import { ErrorBoundary } from './ErrorBoundary';
import { t, useLang } from '../lib/i18n';

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <img src={logoUrl} width={size} height={size} alt="DR IX" className={className} />;
}

/** Hebrew / English switch (remembered for the signed-in person on this device). */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <button type="button" className="small lang-switch" onClick={() => setLang(lang === 'he' ? 'en' : 'he')} aria-label="Language / שפה" lang={lang === 'he' ? 'en' : 'he'}>
      🌐 {lang === 'he' ? 'English' : 'עברית'}
    </button>
  );
}

export function Layout() {
  const { user, canEditInventory } = useAuth();
  const { pathname } = useLocation();
  const connection = useConnection();
  // a new screen always starts at the top (the header is sticky, so a kept scroll position would hide the title)
  // (braces on purpose: an effect must return nothing or a cleanup function, and in newer browsers
  // window.scrollTo() returns a value - returning it made React crash on the first navigation)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="app">
      <div className="site-header">
        <header className="topbar">
          <Link to="/" className="brand">
            <Logo size={34} />
            <span>{t('דריקס OS')}</span>
          </Link>
          <LangSwitch />
          <Link to="/profile" className="me" aria-label={t('הפרופיל שלי')}>
            <span className="avatar">{user?.name.slice(0, 1)}</span>
            <span>{user?.name}</span>
          </Link>
        </header>
        <nav className="tabbar" aria-label={t('ניווט ראשי')}>
          <NavLink to="/" end>
            <span className="ico">📋</span>
            <span>{t('היום')}</span>
          </NavLink>
          <NavLink to="/schedule">
            <span className="ico">🗓️</span>
            <span>{t('סידור')}</span>
          </NavLink>
          {isShared && (
            <NavLink to="/reservations">
              <span className="ico">📅</span>
              <span>{t('הזמנות')}</span>
            </NavLink>
          )}
          <NavLink to="/inventory">
            <span className="ico">📦</span>
            <span>{t('מלאי')}</span>
          </NavLink>
          <NavLink to="/handbook">
            <span className="ico">📖</span>
            <span>{t('נהלים')}</span>
          </NavLink>
          <NavLink to="/games">
            <span className="ico">🎲</span>
            <span>{t('משחקים')}</span>
          </NavLink>
          {canEditInventory && (
            <NavLink to="/admin">
              <span className="ico">⚙️</span>
              <span>{t('ניהול')}</span>
            </NavLink>
          )}
        </nav>
      </div>
      {!isShared && (
        <div className="banner-local">
          {t('מצב מקומי: הנתונים נשמרים רק במכשיר הזה. כדי לעבוד יחד מכמה מכשירים יש לחבר Supabase.')}
        </div>
      )}
      {!connection.ok && (
        <div className="banner-warn" role="status">
          <strong>{t('יש בעיה בטעינת נתונים מהשרת.')}</strong>{' '}{t('מנסה שוב אוטומטית.')}
          <small className="block">{connection.message}</small>
          <button type="button" className="small" onClick={() => window.location.reload()}>
            {t('רענן')}
          </button>
        </div>
      )}
      <main className="content">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
