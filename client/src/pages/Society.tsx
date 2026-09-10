import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Modal, Empty } from '../components/ui';

type Tab = 'residents' | 'plots' | 'societies';

export default function SocietyPage() {
  const { t } = useTranslation();
  const { societyId, societies, refreshSocieties, user } = useAuth();
  const [tab, setTab] = useState<Tab>('residents');
  const [residents, setResidents] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | { kind: Tab; item?: any }>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!societyId) return;
    api.get('/residents', { params: { societyId, search } }).then((r) => setResidents(r.data));
    api.get('/plots', { params: { societyId } }).then((r) => setPlots(r.data));
  };
  useEffect(load, [societyId, search]);

  const del = async (kind: 'residents' | 'plots', id: string) => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.delete(`/${kind}/${id}`);
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries()) as Record<string, string>;
    try {
      if (modal!.kind === 'societies') {
        if (modal!.item) await api.put(`/societies/${modal!.item.id}`, data);
        else await api.post('/societies', data);
        await refreshSocieties();
      } else if (modal!.kind === 'residents') {
        const payload = { ...data, societyId };
        if (modal!.item) await api.put(`/residents/${modal!.item.id}`, payload);
        else await api.post('/residents', payload);
      } else {
        const payload = { ...data, societyId, residentId: data.residentId || null };
        if (modal!.item) await api.put(`/plots/${modal!.item.id}`, payload);
        else await api.post('/plots', payload);
      }
      setModal(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'residents', label: t('common.resident') + 's' },
    { id: 'plots', label: t('common.plot') + 's' },
    ...(user?.role === 'ADMIN' ? [{ id: 'societies' as Tab, label: 'Societies' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              className={tab === tb.id ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === 'residents' && (
            <input className="input w-56" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          )}
          <button className="btn-primary" onClick={() => setModal({ kind: tab })}>
            + {t('common.add')}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {tab === 'residents' && (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">{t('common.name')}</th>
                <th className="th">{t('common.phone')}</th>
                <th className="th">CNIC (last 4)</th>
                <th className="th">{t('common.plot')}s</th>
                <th className="th">WhatsApp</th>
                <th className="th">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {residents.map((r) => (
                <tr key={r.id}>
                  <td className="td font-medium">{r.name}</td>
                  <td className="td">{r.phone}</td>
                  <td className="td">•••{r.cnicLast4}</td>
                  <td className="td">{r.plots.map((p: any) => p.number).join(', ') || '—'}</td>
                  <td className="td">{r.waPhone ? <span className="text-green-600">✓ linked</span> : <span className="text-slate-400">not linked</span>}</td>
                  <td className="td space-x-2">
                    <button className="text-emerald-600 hover:underline" onClick={() => setModal({ kind: 'residents', item: r })}>{t('common.edit')}</button>
                    <button className="text-red-500 hover:underline" onClick={() => del('residents', r.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'plots' && (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Number</th>
                <th className="th">Block</th>
                <th className="th">Type</th>
                <th className="th">{t('common.resident')}</th>
                <th className="th">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plots.map((p) => (
                <tr key={p.id}>
                  <td className="td font-medium">{p.number}</td>
                  <td className="td">{p.block || '—'}</td>
                  <td className="td">{p.type}</td>
                  <td className="td">{p.resident?.name || <span className="text-slate-400">vacant</span>}</td>
                  <td className="td space-x-2">
                    <button className="text-emerald-600 hover:underline" onClick={() => setModal({ kind: 'plots', item: p })}>{t('common.edit')}</button>
                    <button className="text-red-500 hover:underline" onClick={() => del('plots', p.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'societies' && (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">{t('common.name')}</th>
                <th className="th">City</th>
                <th className="th">Address</th>
                <th className="th">Plots</th>
                <th className="th">Residents</th>
                <th className="th">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {societies.map((s) => (
                <tr key={s.id}>
                  <td className="td font-medium">{s.name}</td>
                  <td className="td">{s.city}</td>
                  <td className="td">{s.address}</td>
                  <td className="td">{s._count?.plots}</td>
                  <td className="td">{s._count?.residents}</td>
                  <td className="td">
                    <button className="text-emerald-600 hover:underline" onClick={() => setModal({ kind: 'societies', item: s })}>{t('common.edit')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {((tab === 'residents' && !residents.length) || (tab === 'plots' && !plots.length)) && <Empty text={t('common.noData')} />}
      </div>

      {modal && (
        <Modal title={`${modal.item ? t('common.edit') : t('common.add')} ${modal.kind.slice(0, -1)}`} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-3">
            {modal.kind === 'societies' && (
              <>
                <input className="input" name="name" placeholder="Society name" defaultValue={modal.item?.name} required />
                <input className="input" name="city" placeholder="City" defaultValue={modal.item?.city} required />
                <input className="input" name="address" placeholder="Address" defaultValue={modal.item?.address} required />
              </>
            )}
            {modal.kind === 'residents' && (
              <>
                <input className="input" name="name" placeholder="Full name" defaultValue={modal.item?.name} required />
                <input className="input" name="phone" placeholder="Phone (923001234567)" defaultValue={modal.item?.phone} required />
                <input className="input" name="cnicLast4" placeholder="CNIC last 4 digits" pattern="\d{4}" defaultValue={modal.item?.cnicLast4} required />
              </>
            )}
            {modal.kind === 'plots' && (
              <>
                <input className="input" name="number" placeholder="Plot number (A-101)" defaultValue={modal.item?.number} required />
                <input className="input" name="block" placeholder="Block (optional)" defaultValue={modal.item?.block || ''} />
                <select className="input" name="type" defaultValue={modal.item?.type || 'HOUSE'}>
                  <option value="HOUSE">House</option>
                  <option value="FLAT">Flat</option>
                  <option value="SHOP">Shop</option>
                </select>
                <select className="input" name="residentId" defaultValue={modal.item?.residentId || ''}>
                  <option value="">— vacant —</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </>
            )}
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
