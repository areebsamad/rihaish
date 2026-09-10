import { NavLink, Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { toggleLanguage } from '../i18n';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
  }`;

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, societies, societyId, setSocietyId, logout } = useAuth();
  const isSuperAdmin = user?.role === 'ADMIN' && !user.societyId;

  const nav = [
    { to: '/', label: t('nav.dashboard') },
    { to: '/society', label: t('nav.society'), roles: ['ADMIN'] },
    { to: '/billing', label: t('nav.billing') },
    { to: '/visitors', label: t('nav.visitors') },
    { to: '/complaints', label: t('nav.complaints') },
    { to: '/announcements', label: t('nav.announcements') },
    { to: '/inbox', label: t('nav.inbox') },
    { to: '/documents', label: t('nav.documents') },
    { to: '/audit', label: t('nav.audit') },
  ].filter((n) => !n.roles || n.roles.includes(user?.role || ''));

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-slate-800 p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-white">🏘 {t('app.title')}</div>
          <div className="text-xs text-slate-400">{user?.name}</div>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkCls}>
              {n.label}
            </NavLink>
          ))}
          <a
            href="/whatsapp-simulator"
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-green-300 hover:bg-slate-700"
          >
            📱 {t('nav.simulator')} ↗
          </a>
          {user?.role === 'ADMIN' && (
            <Link to="/guard" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">
              🛡 {t('nav.guard')}
            </Link>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            {isSuperAdmin ? (
              <select className="input w-64" value={societyId || ''} onChange={(e) => setSocietyId(e.target.value)}>
                {societies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.city}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-medium text-slate-600">
                {societies.find((s) => s.id === societyId)?.name || ''}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary" onClick={toggleLanguage}>
              {i18n.language === 'en' ? 'اردو' : 'English'}
            </button>
            <button className="btn-secondary" onClick={logout}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
