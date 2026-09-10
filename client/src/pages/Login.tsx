import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { errMsg } from '../api';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@demo.pk');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'GUARD' ? '/guard' : '/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-700 to-slate-800 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-3xl">🏘</div>
          <h1 className="mt-2 text-xl font-bold text-slate-800">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('login.title')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t('login.email')}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">{t('login.password')}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full justify-center py-2" disabled={busy}>
            {busy ? '...' : t('login.signIn')}
          </button>
        </form>
        <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <div className="mb-1 font-semibold text-slate-600">Demo logins</div>
          <div>Admin: admin@demo.pk / admin123</div>
          <div>Treasurer: treasurer@demo.pk / treasurer123</div>
          <div>Guard: guard@demo.pk / guard123</div>
        </div>
      </div>
    </div>
  );
}
