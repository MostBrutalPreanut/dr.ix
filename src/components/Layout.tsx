import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isShared } from '../lib/db';

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="logo" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-label="DR IX">
      <span>DR</span>
      <span>IX</span>
    </div>
  );
}

export function Layout() {
  const { user, isManager } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo size={34} />
          <span>דריקס OS</span>
        </Link>
        <Link to="/profile" className="me" aria-label="הפרופיל שלי">
          <span className="avatar">{user?.name.slice(0, 1)}</span>
          <span>{user?.name}</span>
        </Link>
      </header>
      {!isShared && (
        <div className="banner-local">
          מצב מקומי: הנתונים נשמרים רק במכשיר הזה. כדי לעבוד יחד מכמה מכשירים יש לחבר Supabase.
        </div>
      )}
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="ניווט ראשי">
        <NavLink to="/" end>
          <span className="ico">📋</span>
          <span>היום</span>
        </NavLink>
        <NavLink to="/handbook">
          <span className="ico">📖</span>
          <span>נהלים</span>
        </NavLink>
        <NavLink to="/games">
          <span className="ico">🎲</span>
          <span>משחקים</span>
        </NavLink>
        {isManager && (
          <NavLink to="/admin">
            <span className="ico">⚙️</span>
            <span>ניהול</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}
