import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Modal, Badge, Empty } from '../components/ui';
import { exportCsv, exportPdf } from '../lib/export';

export default function Visitors() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [visitors, setVisitors] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [qrPass, setQrPass] = useState<any>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = () => {
    if (!societyId) return;
    api
      .get('/visitors', { params: { societyId, status: status || undefined, date: date || undefined, search: search || undefined } })
      .then((r) => setVisitors(r.data));
  };
  useEffect(load, [societyId, status, date, search]);
  useEffect(() => {
    if (societyId) api.get('/plots', { params: { societyId } }).then((r) => setPlots(r.data));
  }, [societyId]);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    try {
      await api.post(`/visitors/${id}/${action}`);
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post('/visitors', {
        plotId: String(fd.get('plotId')),
        name: String(fd.get('name')),
        phone: String(fd.get('phone') || '') || undefined,
        purpose: String(fd.get('purpose') || '') || undefined,
        expectedAt: new Date(String(fd.get('expectedAt'))).toISOString(),
      });
      setNewOpen(false);
      load();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const tableData = () => ({
    headers: ['Visitor', 'Plot', 'Expected', 'Via', 'Pass Code', 'Status', 'Entry', 'Exit'],
    rows: visitors.map((v) => [
      v.name,
      v.plot.number,
      new Date(v.expectedAt).toLocaleString(),
      v.createdVia,
      v.pass?.code || '',
      v.pass?.status || '',
      v.pass?.entryAt ? new Date(v.pass.entryAt).toLocaleTimeString() : '',
      v.pass?.exitAt ? new Date(v.pass.exitAt).toLocaleTimeString() : '',
    ]),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')} {t('common.status').toLowerCase()}</option>
            {['PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input className="input w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input w-48" placeholder={`${t('common.search')} name/plot`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => { const d = tableData(); exportCsv('visitors', d.headers, d.rows); }}>{t('common.exportCsv')}</button>
          <button className="btn-secondary" onClick={() => { const d = tableData(); exportPdf('visitors', 'Visitor Log', d.headers, d.rows); }}>{t('common.exportPdf')}</button>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>+ {t('visitors.newVisitor')}</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Visitor</th>
              <th className="th">{t('common.plot')}</th>
              <th className="th">{t('common.resident')}</th>
              <th className="th">{t('visitors.expected')}</th>
              <th className="th">Via</th>
              <th className="th">{t('visitors.passCode')}</th>
              <th className="th">{t('common.status')}</th>
              <th className="th">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visitors.map((v) => (
              <tr key={v.id}>
                <td className="td font-medium">{v.name}</td>
                <td className="td">{v.plot.number}</td>
                <td className="td">{v.resident?.name || '—'}</td>
                <td className="td">{new Date(v.expectedAt).toLocaleString()}</td>
                <td className="td"><Badge value={v.createdVia} /></td>
                <td className="td font-mono text-xs">{v.pass?.code}</td>
                <td className="td"><Badge value={v.pass?.status || '—'} /></td>
                <td className="td space-x-2 whitespace-nowrap">
                  {v.pass?.status === 'PENDING' && (
                    <>
                      <button className="text-emerald-600 hover:underline" onClick={() => decide(v.id, 'approve')}>{t('common.approve')}</button>
                      <button className="text-red-500 hover:underline" onClick={() => decide(v.id, 'reject')}>{t('common.reject')}</button>
                    </>
                  )}
                  {v.pass?.qrDataUrl && v.pass.status !== 'REJECTED' && (
                    <button className="text-blue-600 hover:underline" onClick={() => setQrPass(v)}>{t('visitors.viewPass')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visitors.length && <Empty text={t('common.noData')} />}
      </div>

      {qrPass && (
        <Modal title={`${t('visitors.viewPass')} — ${qrPass.name}`} onClose={() => setQrPass(null)}>
          <div className="text-center">
            <img src={qrPass.pass.qrDataUrl} alt="QR pass" className="mx-auto" />
            <div className="mt-2 font-mono text-lg font-bold">{qrPass.pass.code}</div>
            <div className="text-sm text-slate-500">
              {qrPass.plot.number} · valid until {new Date(qrPass.pass.expiresAt).toLocaleString()}
            </div>
            <div className="mt-2"><Badge value={qrPass.pass.status} /></div>
            {qrPass.pass.entryAt && <div className="mt-1 text-xs text-slate-500">Entry: {new Date(qrPass.pass.entryAt).toLocaleString()}</div>}
            {qrPass.pass.exitAt && <div className="text-xs text-slate-500">Exit: {new Date(qrPass.pass.exitAt).toLocaleString()}</div>}
          </div>
        </Modal>
      )}

      {newOpen && (
        <Modal title={t('visitors.newVisitor')} onClose={() => setNewOpen(false)}>
          <form onSubmit={create} className="space-y-3">
            <select className="input" name="plotId" required>
              <option value="">Select plot...</option>
              {plots.map((p) => (
                <option key={p.id} value={p.id}>{p.number} — {p.resident?.name || 'vacant'}</option>
              ))}
            </select>
            <input className="input" name="name" placeholder="Visitor name" required />
            <input className="input" name="phone" placeholder="Visitor phone (optional)" />
            <input className="input" name="purpose" placeholder="Purpose (optional)" />
            <input className="input" name="expectedAt" type="datetime-local" defaultValue={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} required />
            <p className="text-xs text-slate-500">Admin-created passes are approved immediately and the QR is sent to the resident's WhatsApp (if linked).</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setNewOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
